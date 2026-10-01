<?php

namespace App\Controller;

use App\Entity\MapNode;
use App\Service\ErrorFormatter;
use App\Service\FloorService;
use App\Service\MapNodeService;
use App\Service\OrganizationSecurityService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/nodes')]
class MapNodeController extends AbstractController
{
    public function __construct(
        private MapNodeService $mapNodeService,
        private FloorService $floorService,
        private ErrorFormatter $errorFormatter,
        private OrganizationSecurityService $securityService,
    ) {}

    /**
     * POST /api/nodes
     * Authorized: Super Admin or Organization Account (for their own map).
     * Body: {
     *   "floorId": int, "externalIdentifier": string, "name": string, "type": string,
     *   "xCoord"?: float, "yCoord"?: float, "metadata"?: array, "geometry"?: array
     * }
     */
    #[Route('', name: 'create_node', methods: ['POST'])]
    #[IsGranted('ROLE_ORGANIZATION')]
    public function create(Request $request): JsonResponse
    {
        $payload = json_decode($request->getContent(), true);

        if (!$payload || empty($payload['floorId']) || empty($payload['type'])) {
            return new JsonResponse(
                $this->errorFormatter->formatError(
                    'Choose a floor and node type before creating the node.',
                    'VALIDATION_ERROR',
                    400
                ),
                400
            );
        }

        $floor = $this->floorService->findFloor($payload['floorId']);
        if (!$floor) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Floor not found.', 'NOT_FOUND', 404),
                404
            );
        }

        // Horizontal authorization check
        $accessError = $this->securityService->checkFloorAccess($this->getUser(), $floor);
        if ($accessError) {
            return $accessError;
        }

        $name = trim((string) ($payload['name'] ?? ''));
        if ($name === '') {
            $existingCount = count($this->mapNodeService->listNodesForFloor($floor));
            do {
                $existingCount++;
                $name = 'Node ' . $existingCount;
                $identifier = strtoupper(str_replace(' ', '-', $name));
                $existing = null;
                foreach ($this->mapNodeService->listNodesForFloor($floor) as $candidate) {
                    if (strtoupper($candidate->getExternalIdentifier()) === $identifier) {
                        $existing = $candidate;
                        break;
                    }
                }
            } while ($existing !== null);
        }

        $externalIdentifier = trim((string) ($payload['externalIdentifier'] ?? ''));
        if ($externalIdentifier === '') {
            $base = strtoupper(preg_replace('/[^A-Z0-9]+/i', '-', $name));
            $base = trim($base, '-');
            $base = $base !== '' ? $base : 'NODE';
            $externalIdentifier = $base;
            $suffix = 2;
            $existingIdentifiers = array_map(
                fn(MapNode $node) => strtoupper($node->getExternalIdentifier()),
                $this->mapNodeService->listNodesForFloor($floor)
            );
            while (in_array(strtoupper($externalIdentifier), $existingIdentifiers, true)) {
                $externalIdentifier = $base . '-' . $suffix;
                $suffix++;
            }
        }

        try {
            $node = $this->mapNodeService->createNode(
                $floor,
                $externalIdentifier,
                $name,
                $payload['type'],
                isset($payload['xCoord']) ? (float) $payload['xCoord'] : null,
                isset($payload['yCoord']) ? (float) $payload['yCoord'] : null,
                $payload['metadata'] ?? null,
                $payload['geometry'] ?? null
            );
        } catch (\DomainException $e) {
            $isConflict = str_contains($e->getMessage(), 'already uses');
            return new JsonResponse(
                $this->errorFormatter->formatError($e->getMessage(), $isConflict ? 'CONFLICT' : 'VALIDATION_ERROR', $isConflict ? 409 : 422),
                $isConflict ? 409 : 422
            );
        }

        return new JsonResponse($this->serializeNode($node), 201);
    }

    /**
     * GET /api/nodes/{id}
     */
    #[Route('/{id}', name: 'get_node', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function getOne(int $id): JsonResponse
    {
        $node = $this->mapNodeService->findNode($id);
        if (!$node) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Node not found.', 'NOT_FOUND', 404),
                404
            );
        }

        $user = $this->getUser();
        $canEdit = $this->securityService->canEditNode($user, $node);
        $isPublished = $node->getFloor()->getBuilding()->getStatus() === 'PUBLISHED';

        if (!$canEdit && !$isPublished) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Node not found.', 'NOT_FOUND', 404),
                404
            );
        }

        return new JsonResponse($this->serializeNode($node));
    }

    /**
     * PUT /api/nodes/{id}
     * Checks horizontal authorization.
     */
    #[Route('/{id}', name: 'update_node', methods: ['PUT'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_ORGANIZATION')]
    public function update(int $id, Request $request): JsonResponse
    {
        $node = $this->mapNodeService->findNode($id);
        if (!$node) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Node not found.', 'NOT_FOUND', 404),
                404
            );
        }

        // Horizontal authorization check
        $accessError = $this->securityService->checkNodeAccess($this->getUser(), $node);
        if ($accessError) {
            return $accessError;
        }

        $payload = json_decode($request->getContent(), true) ?? [];

        try {
            $node = $this->mapNodeService->updateNode($node, $payload);
        } catch (\DomainException $e) {
            return new JsonResponse(
                $this->errorFormatter->formatError($e->getMessage(), 'VALIDATION_ERROR', 422),
                422
            );
        }

        return new JsonResponse($this->serializeNode($node));
    }

    /**
     * DELETE /api/nodes/{id}
     * Checks horizontal authorization.
     */
    #[Route('/{id}', name: 'delete_node', methods: ['DELETE'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_ORGANIZATION')]
    public function delete(int $id): JsonResponse
    {
        $node = $this->mapNodeService->findNode($id);
        if (!$node) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Node not found.', 'NOT_FOUND', 404),
                404
            );
        }

        // Horizontal authorization check
        $accessError = $this->securityService->checkNodeAccess($this->getUser(), $node);
        if ($accessError) {
            return $accessError;
        }

        $removedEdgeIds = $this->mapNodeService->deleteNode($node);

        return new JsonResponse([
            'deletedNodeId' => $id,
            'removedEdgeIds' => $removedEdgeIds,
        ], 200);
    }

    private function serializeNode(MapNode $node): array
    {
        return [
            'id' => $node->getId(),
            'floorId' => $node->getFloor()->getId(),
            'externalIdentifier' => $node->getExternalIdentifier(),
            'name' => $node->getName(),
            'type' => $node->getType(),
            'xCoord' => $node->getXCoord(),
            'yCoord' => $node->getYCoord(),
            'metadata' => $node->getMetadata(),
            'geometry' => $node->getGeometry(),
        ];
    }
}

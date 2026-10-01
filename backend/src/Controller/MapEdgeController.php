<?php

namespace App\Controller;

use App\Entity\MapEdge;
use App\Service\ConnectionService;
use App\Service\ErrorFormatter;
use App\Service\MapNodeService;
use App\Service\OrganizationSecurityService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/edges')]
class MapEdgeController extends AbstractController
{
    public function __construct(
        private ConnectionService $connectionService,
        private MapNodeService $mapNodeService,
        private ErrorFormatter $errorFormatter,
        private OrganizationSecurityService $securityService,
    ) {}

    /**
     * POST /api/edges
     * Authorized: Super Admin or Organization Account (for their own map).
     */
    #[Route('', name: 'create_edge', methods: ['POST'])]
    #[IsGranted('ROLE_ORGANIZATION')]
    public function create(Request $request): JsonResponse
    {
        $payload = json_decode($request->getContent(), true);

        if (!$payload || empty($payload['fromNodeId']) || empty($payload['toNodeId']) || !isset($payload['distance'])) {
            return new JsonResponse(
                $this->errorFormatter->formatError(
                    'Fields "fromNodeId", "toNodeId" and "distance" are required.',
                    'VALIDATION_ERROR',
                    400
                ),
                400
            );
        }

        $fromNode = $this->mapNodeService->findNode($payload['fromNodeId']);
        $toNode = $this->mapNodeService->findNode($payload['toNodeId']);

        if (!$fromNode || !$toNode) {
            return new JsonResponse(
                $this->errorFormatter->formatError('One or both nodes do not exist.', 'NOT_FOUND', 404),
                404
            );
        }

        // Horizontal authorization check
        $accessError = $this->securityService->checkNodeAccess($this->getUser(), $fromNode);
        if ($accessError) {
            return $accessError;
        }

        try {
            $edge = $this->connectionService->connectNodes(
                $fromNode,
                $toNode,
                (float) $payload['distance'],
                $payload['bidirectional'] ?? true,
                $payload['accessible'] ?? true
            );
        } catch (\DomainException $e) {
            $isConflict = str_contains($e->getMessage(), 'already exists');
            return new JsonResponse(
                $this->errorFormatter->formatError($e->getMessage(), $isConflict ? 'CONFLICT' : 'VALIDATION_ERROR', $isConflict ? 409 : 422),
                $isConflict ? 409 : 422
            );
        }

        return new JsonResponse($this->serializeEdge($edge), 201);
    }

    /**
     * PUT/PATCH /api/edges/{id}
     * Checks horizontal authorization.
     */
    #[Route('/{id}', name: 'update_edge', methods: ['PUT', 'PATCH'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_ORGANIZATION')]
    public function update(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $edge = $this->connectionService->findEdge($id);
        if (!$edge) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Edge not found.', 'NOT_FOUND', 404),
                404
            );
        }

        // Horizontal authorization check
        $accessError = $this->securityService->checkNodeAccess($this->getUser(), $edge->getFromNode());
        if ($accessError) {
            return $accessError;
        }

        $payload = json_decode($request->getContent(), true);
        if (!$payload) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Invalid JSON payload.', 'VALIDATION_ERROR', 400),
                400
            );
        }

        $isUpdated = false;

        if (isset($payload['distance'])) {
            if (!is_numeric($payload['distance']) || $payload['distance'] <= 0) {
                return new JsonResponse(
                    $this->errorFormatter->formatError('Distance must be a positive number.', 'VALIDATION_ERROR', 422),
                    422
                );
            }
            $edge->setDistance((float) $payload['distance']);
            $isUpdated = true;
        }

        if (isset($payload['bidirectional'])) {
            $edge->setBidirectional((bool) $payload['bidirectional']);
            $isUpdated = true;
        }

        if ($isUpdated) {
            $edge->setUpdatedAt(new \DateTimeImmutable());
            $em->flush();
        }

        return new JsonResponse($this->serializeEdge($edge), 200);
    }

    /**
     * DELETE /api/edges/{id}
     * Checks horizontal authorization.
     */
    #[Route('/{id}', name: 'delete_edge', methods: ['DELETE'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_ORGANIZATION')]
    public function delete(int $id): JsonResponse
    {
        $edge = $this->connectionService->findEdge($id);
        if (!$edge) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Edge not found.', 'NOT_FOUND', 404),
                404
            );
        }

        // Horizontal authorization check
        $accessError = $this->securityService->checkNodeAccess($this->getUser(), $edge->getFromNode());
        if ($accessError) {
            return $accessError;
        }

        $this->connectionService->disconnectNodes($edge);

        return new JsonResponse(null, 204);
    }

    private function serializeEdge(MapEdge $edge): array
    {
        return [
            'id' => $edge->getId(),
            'fromNodeId' => $edge->getFromNode()->getId(),
            'toNodeId' => $edge->getToNode()->getId(),
            'distance' => $edge->getDistance(),
            'bidirectional' => $edge->isBidirectional(),
            'accessible' => $edge->isAccessible(),
        ];
    }
}
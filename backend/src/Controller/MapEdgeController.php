<?php

namespace App\Controller;

use App\Service\ConnectionService;
use App\Service\MapNodeService;
use App\Service\ErrorFormatter;
use App\Entity\MapEdge;
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
    ) {}

    /**
     * POST /api/edges
     * Admin only.
     * Body: {
     *   "fromNodeId": int, "toNodeId": int, "distance": float,
     *   "bidirectional"?: bool (default true), "accessible"?: bool (default true)
     * }
     * ConnectionService::connectNodes already validates:
     *   - distance > 0
     *   - fromNode !== toNode
     *   - no duplicate connection (either direction)
     * Cross-building edges ARE allowed (the same-building restriction was
     * deliberately removed in ConnectionService - see comment in that file).
     */
    #[Route('', name:'create_edge',methods: ['POST'])]
    #[IsGranted('ROLE_ADMIN')]
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

        try {
            $edge = $this->connectionService->connectNodes(
                $fromNode,
                $toNode,
                (float) $payload['distance'],
                $payload['bidirectional'] ?? true,
                $payload['accessible'] ?? true
            );
        } catch (\DomainException $e) {
            // "already exists" -> 409 conflict, everything else (bad distance, self-loop) -> 422
            $isConflict = str_contains($e->getMessage(), 'already exists');
            return new JsonResponse(
                $this->errorFormatter->formatError($e->getMessage(), $isConflict ? 'CONFLICT' : 'VALIDATION_ERROR', $isConflict ? 409 : 422),
                $isConflict ? 409 : 422
            );
        }

        // NOTE: creating an edge changes the graph shape but does not currently
        // reset the parent building(s) status to DRAFT inside ConnectionService.
        // Consider adding that (mirroring MapNodeService/FloorService behaviour)
        // if you want "any structural change reverts to DRAFT" to hold for edges too.

        return new JsonResponse($this->serializeEdge($edge), 201);
    }

    /**
     * DELETE /api/edges/{id}
     * Admin only.
     */
    #[Route('/{id}', name:'delete_edge',methods: ['DELETE'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_ADMIN')]
    public function delete(int $id): JsonResponse
    {
        $edge = $this->connectionService->findEdge($id);
        if (!$edge) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Edge not found.', 'NOT_FOUND', 404),
                404
            );
        }

        $this->connectionService->disconnectNodes($edge);

        return new JsonResponse(null, 204);
    }


    // helper function
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
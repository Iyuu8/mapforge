<?php

namespace App\Controller;

use App\Service\RoutingService;
use App\Service\MapNodeService;
use App\Service\ErrorFormatter;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/routes')]
class RouteController extends AbstractController
{
    public function __construct(
        private RoutingService $routingService,
        private MapNodeService $mapNodeService,
        private ErrorFormatter $errorFormatter,
    ) {}

    /**
     * GET /api/routes/find?sourceId=101&destinationId=105&accessibleOnly=true
     * Public / authenticated (per endpoint table) - NO #[IsGranted] here.
     *
     * Guard rail (defense in depth, not in the plan's explicit table but consistent
     * with "public map endpoints must not expose draft buildings", §6 rule 12):
     * for non-admins, refuse to compute a route if either endpoint node belongs to
     * a DRAFT building - otherwise an anonymous user could probe unpublished maps
     * via routing even if they can't fetch them directly.
     */
    #[Route('/find', name:'find_path',methods: ['GET'])]
    public function find(Request $request): JsonResponse
    {
        $sourceId = $request->query->get('sourceId');
        $destinationId = $request->query->get('destinationId');
        $accessibleOnly = filter_var($request->query->get('accessibleOnly', 'false'), FILTER_VALIDATE_BOOLEAN);

        if (!$sourceId || !$destinationId) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Query params "sourceId" and "destinationId" are required.', 'VALIDATION_ERROR', 400),
                400
            );
        }

        $source = $this->mapNodeService->findNode((int) $sourceId);
        $destination = $this->mapNodeService->findNode((int) $destinationId);

        if (!$source || !$destination) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Source or destination node does not exist.', 'NODE_NOT_FOUND', 404),
                404
            );
        }

        $isAdmin = $this->isGranted('ROLE_ADMIN');

        if (!$isAdmin) {
            $sourcePublished = $source->getFloor()->getBuilding()->getStatus() === 'PUBLISHED';
            $destPublished = $destination->getFloor()->getBuilding()->getStatus() === 'PUBLISHED';
            if (!$sourcePublished || !$destPublished) {
                return new JsonResponse(
                    $this->errorFormatter->formatError('Source or destination node does not exist.', 'NODE_NOT_FOUND', 404),
                    404
                );
            }
        }

        $result = $this->routingService->findRoute($source, $destination, $accessibleOnly, $isAdmin);

        if ($result === null) {
            return new JsonResponse(
                $this->errorFormatter->formatError('No route exists between the given nodes.', 'ROUTE_NOT_FOUND', 404),
                404
            );
        }

        return new JsonResponse([
            'sourceId' => $source->getId(),
            'destinationId' => $destination->getId(),
            'totalDistance' => $result['totalDistance'],
            'path' => array_map(fn($node) => [
                'id' => $node->getId(),
                'identifier' => $node->getExternalIdentifier(),
                'name' => $node->getName(),
                'floorId' => $node->getFloor()->getId(),
                'xCoord' => $node->getXCoord(),
                'yCoord' => $node->getYCoord(),
            ], $result['path']),
        ]);
    }
}
<?php

namespace App\Controller;

use App\Entity\Building;
use App\Service\FloorService;
use App\Service\BuildingService;
use App\Service\ErrorFormatter;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/floors')]
class FloorController extends AbstractController
{
    public function __construct(
        private FloorService $floorService,
        private BuildingService $buildingService,
        private ErrorFormatter $errorFormatter,
    ) {}

    /**
     * POST /api/floors
     * Admin only.
     * Body: { "buildingId": int, "name": string, "floorNumber": int, "geometry"?: array }
     * FloorService::createFloor throws \DomainException on duplicate floorNumber
     * within the same building (unique_building_floor constraint) -> 422.
     */
    #[Route('', name:'create_floor',methods: ['POST'])]
    #[IsGranted('ROLE_ADMIN')]
    public function create(Request $request): JsonResponse
    {
        $payload = json_decode($request->getContent(), true);

        if (!$payload || empty($payload['buildingId']) || empty($payload['name']) || !isset($payload['floorNumber'])) {
            return new JsonResponse(
                $this->errorFormatter->formatError(
                    'Fields "buildingId", "name" and "floorNumber" are required.',
                    'VALIDATION_ERROR',
                    400
                ),
                400
            );
        }

        $building = $this->buildingService->findBuilding($payload['buildingId']);
        if (!$building) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Building not found.', 'NOT_FOUND', 404),
                404
            );
        }

        try {
            $floor = $this->floorService->createFloor(
                $building,
                $payload['name'],
                (int) $payload['floorNumber'],
                $payload['geometry'] ?? null
            );
        } catch (\DomainException $e) {
            return new JsonResponse(
                $this->errorFormatter->formatError($e->getMessage(), 'CONFLICT', 409),
                409
            );
        }

        return new JsonResponse($this->serializeFloor($floor), 201);
    }

    /**
     * GET /api/floors/{id}
     * Admin: always visible.
     * Public/user: only if the parent building is PUBLISHED.
     */
    #[Route('/{id}', name:'get_floor_by_id',methods: ['GET'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_USER')]
    public function getOne(int $id): JsonResponse
    {
        $floor = $this->floorService->findFloor($id);

        if (!$floor) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Floor not found.', 'NOT_FOUND', 404),
                404
            );
        }

        $isPublished = $floor->getBuilding()->getStatus() === 'PUBLISHED';
        if (!$this->isGranted('ROLE_ADMIN') && !$isPublished) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Floor not found.', 'NOT_FOUND', 404),
                404
            );
        }

        return new JsonResponse($this->serializeFloor($floor));
    }

    /**
     * PUT /api/floors/{id}
     * Admin only. Not in the endpoint table explicitly but FloorService::updateFloor
     * already exists and the editor (plan 13) needs it for renames/geometry edits.
     */
    #[Route('/{id}', name:'edit_floor',methods: ['PUT'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_ADMIN')]
    public function update(int $id, Request $request): JsonResponse
    {
        $floor = $this->floorService->findFloor($id);
        if (!$floor) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Floor not found.', 'NOT_FOUND', 404),
                404
            );
        }

        $payload = json_decode($request->getContent(), true) ?? [];

        try {
            $floor = $this->floorService->updateFloor($floor, $payload);
        } catch (\DomainException $e) {
            return new JsonResponse(
                $this->errorFormatter->formatError($e->getMessage(), 'CONFLICT', 409),
                409
            );
        }

        return new JsonResponse($this->serializeFloor($floor));
    }

    // helper function
    private function serializeFloor(\App\Entity\Floor $floor): array
    {
        return [
            'id' => $floor->getId(),
            'buildingId' => $floor->getBuilding()->getId(),
            'name' => $floor->getName(),
            'floorNumber' => $floor->getFloorNumber(),
            'geometry' => $floor->getGeometry(),
        ];
    }
}
<?php

namespace App\Controller;

use App\Service\FloorService;
use App\Service\BuildingService;
use App\Service\ErrorFormatter;
use App\Service\OrganizationSecurityService;
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
        private OrganizationSecurityService $securityService,
    ) {}

    /**
     * POST /api/floors
     * Authorized: Super Admin or Organization Account.
     * Body: { "buildingId": int, "name": string, "floorNumber": int, "geometry"?: array }
     */
    #[Route('', name: 'create_floor', methods: ['POST'])]
    #[IsGranted('ROLE_ORGANIZATION')]
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

        // Horizontal authorization check
        $accessError = $this->securityService->checkBuildingAccess($this->getUser(), $building);
        if ($accessError) {
            return $accessError;
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
    #[Route('/{id}', name: 'get_floor_by_id', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function getOne(int $id): JsonResponse
    {
        $floor = $this->floorService->findFloor($id);

        if (!$floor) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Floor not found.', 'NOT_FOUND', 404),
                404
            );
        }

        $user = $this->getUser();
        $canEdit = $this->securityService->canEditFloor($user, $floor);
        $isPublished = $floor->getBuilding()->getStatus() === 'PUBLISHED';

        if (!$canEdit && !$isPublished) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Floor not found.', 'NOT_FOUND', 404),
                404
            );
        }

        return new JsonResponse($this->serializeFloor($floor));
    }

    /**
     * PUT /api/floors/{id}
     */
    #[Route('/{id}', name: 'edit_floor', methods: ['PUT'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_ORGANIZATION')]
    public function update(int $id, Request $request): JsonResponse
    {
        $floor = $this->floorService->findFloor($id);
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

    /**
     * DELETE /api/floors/{id}
     */
    #[Route('/{id}', name: 'delete_floor', methods: ['DELETE'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_ORGANIZATION')]
    public function delete(int $id): JsonResponse
    {
        $floor = $this->floorService->findFloor($id);

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

        try {
            $this->floorService->deleteFloor($floor);
        } catch (\Throwable $e) {
            return new JsonResponse(
                $this->errorFormatter->formatError(
                    'Unable to delete floor.',
                    'CONFLICT',
                    409
                ),
                409
            );
        }

        return new JsonResponse(null, 204);
    }

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

<?php

namespace App\Controller;

use App\Entity\Building;
use App\Entity\Organization;
use App\Service\BuildingService;
use App\Service\ErrorFormatter;
use App\Service\OrganizationSecurityService;
use App\Service\PublishService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/organizations')]
class OrganizationController extends AbstractController
{
    public function __construct(
        private EntityManagerInterface $em,
        private BuildingService $buildingService,
        private PublishService $publishService,
        private ErrorFormatter $errorFormatter,
        private OrganizationSecurityService $securityService,
    ) {}

    /**
     * GET /api/organizations
     * Lists organizations. Public viewers see all public maps.
     * Enriched with canEdit and ownership flags for horizontal authorization.
     */
    #[Route('', name: 'get_origanizations', methods: ['GET'])]
    public function list(): JsonResponse
    {
        $organizations = $this->em->getRepository(Organization::class)->findAll();
        $user = $this->getUser();

        $data = array_map(function (Organization $o) use ($user) {
            $canEdit = $this->securityService->canEditOrganization($user, $o);
            $owner = $o->getOwner();
            $isOwner = $user && $owner && $owner->getId() === $user->getId();

            return [
                'id' => $o->getId(),
                'name' => $o->getName(),
                'description' => $o->getDescription(),
                'address' => $o->getAddress(),
                'phone' => $o->getPhone(),
                'createdAt' => $o->getCreatedAt()?->format(\DateTime::ATOM),
                'canvasWidth' => $o->getCanvasWidth(),
                'canvasHeight' => $o->getCanvasHeight(),
                'buildingCount' => $o->getBuildings()->count(),
                'tracingImages' => $canEdit ? $o->getTracingImages() : null,
                'canEdit' => $canEdit,
                'isOwner' => $isOwner,
                'owner' => $owner ? [
                    'id' => $owner->getId(),
                    'email' => $owner->getEmail(),
                ] : null,
            ];
        }, $organizations);

        return new JsonResponse($data);
    }

    /**
     * POST /api/organizations
     * Authorized: Super Admin or Organization Account.
     * Body: { "name": string, "description"?: string, "address"?: string, "phone"?: string }
     */
    #[Route('', name: 'create_organization', methods: ['POST'])]
    #[IsGranted('ROLE_ORGANIZATION')]
    public function create(Request $request): JsonResponse
    {
        $payload = json_decode($request->getContent(), true);

        if (!$payload || empty($payload['name'])) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Field "name" is required.', 'VALIDATION_ERROR', 400),
                400
            );
        }

        $now = new \DateTimeImmutable();
        $user = $this->getUser();

        // Create Organization
        $org = new Organization();
        $org->setName($payload['name']);
        $org->setDescription($payload['description'] ?? null);
        $org->setAddress($payload['address'] ?? null);
        $org->setPhone($payload['phone'] ?? null);
        $org->setCanvasHeight($payload['canvasHeight'] ?? 6000);
        $org->setCanvasWidth($payload['canvasWidth'] ?? 8000);
        $org->setCreatedAt($now);
        $org->setUpdatedAt($now);
        if ($user) {
            $org->setOwner($user);
        }

        $this->em->persist($org);

        // Auto-create Default Campus (Outdoor Section)
        $campus = new Building();
        $campus->setName('Default Campus');
        $campus->setDescription('Outdoor section and main campus grounds for ' . $org->getName());
        $campus->setStatus('DRAFT');
        $campus->setOrganization($org);
        $campus->setCreatedAt($now);
        $campus->setUpdatedAt($now);

        $this->em->persist($campus);
        $this->em->flush();

        return new JsonResponse([
            'id' => $org->getId(),
            'name' => $org->getName(),
            'description' => $org->getDescription(),
            'address' => $org->getAddress(),
            'phone' => $org->getPhone(),
            'createdAt' => $org->getCreatedAt()->format(\DateTime::ATOM),
            'canvasWidth' => $org->getCanvasWidth(),
            'canvasHeight' => $org->getCanvasHeight(),
            'tracingImages' => $org->getTracingImages(),
            'canEdit' => true,
            'isOwner' => true,
            'defaultCampus' => [
                'id' => $campus->getId(),
                'name' => $campus->getName(),
                'status' => $campus->getStatus(),
                'createdAt' => $campus->getCreatedAt()->format(\DateTime::ATOM),
                'geometry' => $campus->getGeometry(),
                'description' => $campus->getDescription(),
                'color' => $campus->getColor(),
            ],
        ], 201);
    }

    /**
     * PUT/PATCH /api/organizations/{id}
     * Checks horizontal authorization: only owner or super admin can edit.
     */
    #[Route('/{id}', name: 'edit_organization', methods: ['PUT', 'PATCH'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_ORGANIZATION')]
    public function update(Request $request, int $id): JsonResponse
    {
        $payload = json_decode($request->getContent(), true);

        if (!$payload) {
            return new JsonResponse(
                $this->errorFormatter->formatError('missing required fields', 'BAD_REQUEST', Response::HTTP_BAD_REQUEST),
                Response::HTTP_BAD_REQUEST
            );
        }

        $org = $this->em->getRepository(Organization::class)->find($id);
        if (!$org) {
            return $this->json($this->errorFormatter->formatError('Organization not found.', 'NOT_FOUND', Response::HTTP_NOT_FOUND), Response::HTTP_NOT_FOUND);
        }

        // Horizontal authorization check
        $accessError = $this->securityService->checkOrganizationAccess($this->getUser(), $org);
        if ($accessError) {
            return $accessError;
        }

        $campus = $this->em->getRepository(Building::class)->findOneBy(['name' => 'Default Campus', 'organization' => $org]);

        if ($org->getName() && isset($payload['name']) && !trim($payload['name'])) {
            return $this->json($this->errorFormatter->formatError('you cannot remove the name of the organization', 'BAD_REQUEST', Response::HTTP_BAD_REQUEST), Response::HTTP_BAD_REQUEST);
        }
        if (isset($payload['name'])) {
            $org->setName($payload['name']);
        }

        if (array_key_exists('description', $payload)) {
            $org->setDescription(trim((string) $payload['description']) ?: null);
        }
        if (array_key_exists('address', $payload)) {
            $org->setAddress(trim((string) $payload['address']) ?: null);
        }
        if (array_key_exists('phone', $payload)) {
            $org->setPhone(trim((string) $payload['phone']) ?: null);
        }

        $tracingImages = $payload['tracingImages'] ?? null;
        if ($tracingImages && is_array($tracingImages)) {
            $org->setTracingImages($tracingImages);
        }

        $now = new \DateTimeImmutable();
        $org->setUpdatedAt($now);

        $this->em->flush();

        return new JsonResponse([
            'id' => $org->getId(),
            'name' => $org->getName(),
            'description' => $org->getDescription(),
            'address' => $org->getAddress(),
            'phone' => $org->getPhone(),
            'createdAt' => $org->getCreatedAt()->format(\DateTime::ATOM),
            'canvasWidth' => $org->getCanvasWidth(),
            'canvasHeight' => $org->getCanvasHeight(),
            'tracingImages' => $org->getTracingImages(),
            'canEdit' => true,
            'isOwner' => true,
            'defaultCampus' => [
                'id' => $campus?->getId(),
                'name' => $campus?->getName(),
                'status' => $campus?->getStatus(),
                'createdAt' => $campus?->getCreatedAt()->format(\DateTime::ATOM),
                'geometry' => $campus?->getGeometry(),
                'description' => $campus?->getDescription(),
                'color' => $campus?->getColor(),
            ],
        ], 200);
    }

    /**
     * GET /api/organizations/{id}
     */
    #[Route('/{id}', name: 'get_organization_by_id', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function getOne(int $id): JsonResponse
    {
        $org = $this->em->getRepository(Organization::class)->find($id);

        if (!$org) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Organization not found.', 'NOT_FOUND', 404),
                404
            );
        }

        $user = $this->getUser();
        $canEdit = $this->securityService->canEditOrganization($user, $org);
        $owner = $org->getOwner();
        $isOwner = $user && $owner && $owner->getId() === $user->getId();

        return new JsonResponse([
            'id' => $org->getId(),
            'name' => $org->getName(),
            'description' => $org->getDescription(),
            'address' => $org->getAddress(),
            'phone' => $org->getPhone(),
            'createdAt' => $org->getCreatedAt()->format(\DateTime::ATOM),
            'canvasWidth' => $org->getCanvasWidth(),
            'canvasHeight' => $org->getCanvasHeight(),
            'tracingImages' => $canEdit ? $org->getTracingImages() : null,
            'canEdit' => $canEdit,
            'isOwner' => $isOwner,
            'owner' => $owner ? [
                'id' => $owner->getId(),
                'email' => $owner->getEmail(),
            ] : null,
        ]);
    }

    /**
     * DELETE /api/organizations/{id}
     * Checks horizontal authorization: only owner or super admin can delete.
     */
    #[Route('/{id}', name: 'remove_organization', methods: ['DELETE'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_ORGANIZATION')]
    public function delete(int $id): JsonResponse
    {
        $org = $this->em->getRepository(Organization::class)->find($id);

        if (!$org) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Organization not found.', 'NOT_FOUND', 404),
                404
            );
        }

        // Horizontal authorization check
        $accessError = $this->securityService->checkOrganizationAccess($this->getUser(), $org);
        if ($accessError) {
            return $accessError;
        }

        try {
            $buildings = $this->em->getRepository(Building::class)->findBy(['organization' => $org]);
            foreach ($buildings as $building) {
                $this->buildingService->deleteBuilding($building);
            }

            $this->em->remove($org);
            $this->em->flush();
        } catch (\Exception $e) {
            return new JsonResponse(
                $this->errorFormatter->formatError(
                    'Unable to delete organization.',
                    'CONFLICT',
                    409
                ),
                409
            );
        }

        return new JsonResponse(null, 204);
    }

    /**
     * GET /api/organizations/{id}/buildings
     * Admin/Owner: all buildings (DRAFT + PUBLISHED).
     * Public/user: PUBLISHED only.
     */
    #[Route('/{id}/buildings', name: 'get_buildings_organization', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function buildings(int $id): JsonResponse
    {
        $org = $this->em->getRepository(Organization::class)->find($id);

        if (!$org) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Organization not found.', 'NOT_FOUND', 404),
                404
            );
        }

        $user = $this->getUser();
        $canEdit = $this->securityService->canEditOrganization($user, $org);

        $buildings = $canEdit
            ? $this->em->getRepository(Building::class)->findBy(['organization' => $org])
            : $this->em->getRepository(Building::class)->findBy(['organization' => $org, 'status' => 'PUBLISHED']);

        $data = array_map(fn(Building $b) => [
            'id' => $b->getId(),
            'name' => $b->getName(),
            'status' => $b->getStatus(),
            'color' => $b->getColor(),
            'description' => $b->getDescription(),
            'geometry' => $b->getGeometry(),
            'createdAt' => $b->getCreatedAt(),
            'updatedAt' => $b->getUpdatedAt(),
        ], $buildings);

        return new JsonResponse($data);
    }

    /**
     * POST /api/organizations/{id}/publish
     * Checks horizontal authorization: only owner or super admin can publish.
     */
    #[Route('/{id}/publish', name: 'publish_all_buildings_in_organization', methods: ['POST'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_ORGANIZATION')]
    public function publishAll(int $id): JsonResponse
    {
        $org = $this->em->getRepository(Organization::class)->find($id);

        if (!$org) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Organization not found.', 'NOT_FOUND', 404),
                404
            );
        }

        // Horizontal authorization check
        $accessError = $this->securityService->checkOrganizationAccess($this->getUser(), $org);
        if ($accessError) {
            return $accessError;
        }

        $buildings = $this->em->getRepository(Building::class)->findBy(['organization' => $org]);

        if (empty($buildings)) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Organization has no buildings to publish.', 'VALIDATION_ERROR', 422),
                422
            );
        }

        $results = [];
        $overallSuccess = true;

        foreach ($buildings as $building) {
            $result = $this->publishService->publish($building);
            $results[] = [
                'buildingId' => $building->getId(),
                'name' => $building->getName(),
                'success' => $result['success'],
                'errors' => $result['errors'],
            ];
            if (!$result['success']) {
                $overallSuccess = false;
            }
        }

        return new JsonResponse([
            'success' => $overallSuccess,
            'results' => $results,
        ], $overallSuccess ? 200 : 422);
    }
}

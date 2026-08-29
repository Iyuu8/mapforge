<?php

namespace App\Controller;

use App\Entity\Organization;
use App\Entity\Building;
use App\Service\BuildingService;
use App\Service\PublishService;
use App\Service\ErrorFormatter;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\HttpFoundation\Response;


#[Route('/api/organizations')]
class OrganizationController extends AbstractController
{
    // NOTE: There is no OrganizationService yet (only BuildingService, FloorService, etc.
    // were provided). CRUD here is done directly through the EntityManager to respect
    // "no fake logic" but this SHOULD be extracted into an OrganizationService later
    // to match the architecture rule "services own domain operations".
    public function __construct(
        private EntityManagerInterface $em,
        private BuildingService $buildingService,
        private PublishService $publishService,
        private ErrorFormatter $errorFormatter,
    ) {}

    /**
     * GET /api/organizations
     * Admin: sees all organizations.
     * Public/user: sees all organizations too (organizations themselves aren't
     * DRAFT/PUBLISHED - only Buildings are). Filtering of draft content happens
     * one level down, on the /buildings sub-resource.
     */
    #[Route('', name:'get_origanizations',methods: ['GET'])]
    public function list(): JsonResponse
    {
        $organizations = $this->em->getRepository(Organization::class)->findAll();
        $isAdmin = $this->isGranted('ROLE_ADMIN');
        $data = array_map(fn(Organization $o) => [
            'id' => $o->getId(),
            'name' => $o->getName(),
            'description' => $o->getDescription(),
            'createdAt' => $o->getCreatedAt()->format(\DateTime::ATOM),
            'canvasWidth'=>$o->getCanvasWidth(),
            'canvasHeight'=>$o->getCanvasHeight(),
            'tracingImages'=>$isAdmin? $o->getTracingImages() : null,
        ], $organizations);

        return new JsonResponse($data);
    }

    /**
     * POST /api/organizations
     * Admin only.
     * Body: { "name": string, "description"?: string }
     */
    #[Route('', name: 'create_organization', methods: ['POST'])]
    #[IsGranted('ROLE_ADMIN')]
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

        // Create Organization = map
        $org = new Organization();
        $org->setName($payload['name']);
        $org->setDescription($payload['description'] ?? null);
        $org->setCanvasHeight($payload['canvasHeight']?? 6000);
        $org->setCanvasWidth($payload['canvasWidth']?? 8000);
        $org->setCreatedAt($now);
        $org->setUpdatedAt($now);
        

        $this->em->persist($org);

        // auto create Default Campus (Outdoor Section), the outdoor section is not some sort of container, it is conceptually just a building that links other buildings together, it is possible to add floors to it, define nodes ... etc, because defining the shortest path is possible among buildings it is therefore possible to use this as way to link buildings together
        // notice that no floor was created here, the outdoor section was created without floor, but it should have a floor, creating the floor will be left for the user to do, hence the fact that he should create a floor for the outdoor section should be obvious
        $campus = new Building();
        $campus->setName('Default Campus');
        $campus->setDescription('Outdoor section and main campus grounds for ' . $org->getName());
        $campus->setStatus('DRAFT');
        $campus->setOrganization($org);
        $campus->setCreatedAt($now);
        $campus->setUpdatedAt($now);

        $this->em->persist($campus);

        // 3. Flush transactions
        $this->em->flush();

        return new JsonResponse([
            'id' => $org->getId(),
            'name' => $org->getName(),
            'description' => $org->getDescription(),
            'createdAt' => $org->getCreatedAt()->format(\DateTime::ATOM),
            'canvasWidth'=>$org->getCanvasWidth(),
            'canvasHeight'=>$org->getCanvasHeight(),
            'tracingImages'=>$org->getTracingImages(),
            'defaultCampus' => [
                'id' => $campus->getId(),
                'name' => $campus->getName(),
                'status' => $campus->getStatus(),
                'createdAt' => $campus->getCreatedAt()->format(\DateTime::ATOM),
                'geometry' => $campus->getGeometry(),
                'description' => $campus->getDescription(),
                'color'=>$campus->getColor(),
            ],
        ], 201);
    }

    #[Route('/{id}', name: 'edit_organization', methods: ['PUT','PATCH'])]
    #[IsGranted('ROLE_ADMIN')]
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
        if(!$org) return $this->json($this->errorFormatter->formatError("Organization not found.","NOT_FOUND",Response::HTTP_NOT_FOUND),Response::HTTP_NOT_FOUND);

        $campus = $this->em->getRepository(Building::class)->findOneBy(['name'=>'Default Campus', 'organization'=>$org]);

        /** @var Organization $org */
        if($org->getName() && isset($payload['name']) && !trim($payload['name'])) return $this->json($this->errorFormatter->formatError('you cannot remove the name of the organization','BAD_REQUEST',Response::HTTP_BAD_REQUEST),Response::HTTP_BAD_REQUEST);
        if(isset($payload['name'])) $org->setName($payload['name']);

        $description = trim($payload['description']?? '');
        if($description) $org->setDescription($description);

        // not possible to change the canvas height and width, possible to add images and change change their order ( z index ), the strcuture in the request is bellow
        /*
            [
                {
                    "id": "a1b2c3d4",
                    "imagePath": "/uploads/blueprint1.png",
                    "x": 150.5,
                    "y": 200.0,
                    "width": 1024,
                    "height": 768,
                    "zIndex": 1
                },
                {
                    "id": "a1b2c3d5",
                    "imagePath": "/uploads/blueprint2.png",
                    "x": 150.5,
                    "y": 200.0,
                    "width": 1024,
                    "height": 768,
                    "zIndex": 1
                },
            ] 
        */
        $tracingImages = $payload['tracingImages']?? null;
        if($tracingImages && is_array($tracingImages)) $org->setTracingImages($tracingImages);

        $now = new \DateTimeImmutable();
        $org->setUpdatedAt($now);

        $this->em->flush();

        return new JsonResponse([
            'id' => $org->getId(),
            'name' => $org->getName(),
            'description' => $org->getDescription(),
            'createdAt' => $org->getCreatedAt()->format(\DateTime::ATOM),
            'canvasWidth'=>$org->getCanvasWidth(),
            'canvasHeight'=>$org->getCanvasHeight(),
            'tracingImages'=>$org->getTracingImages(),
            'defaultCampus' => [
                'id' => $campus?->getId(),
                'name' => $campus?->getName(),
                'status' => $campus?->getStatus(),
                'createdAt' => $campus?->getCreatedAt()->format(\DateTime::ATOM),
                'geometry' => $campus?->getGeometry(),
                'description' => $campus?->getDescription(),
                'color'=>$campus?->getColor(),
            ],
        ], 201);
    }


    /**
     * GET /api/organizations/{id}
     */
    #[Route('/{id}', name:'get_organization_by_id',methods: ['GET'], requirements: ['id' => '\d+'])]
    public function getOne(int $id): JsonResponse
    {
        $org = $this->em->getRepository(Organization::class)->find($id);

        if (!$org) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Organization not found.', 'NOT_FOUND', 404),
                404
            );
        }

        $isAdmin = $this->isGranted('ROLE_ADMIN');
        return new JsonResponse([
            'id' => $org->getId(),
            'name' => $org->getName(),
            'description' => $org->getDescription(),
            'createdAt' => $org->getCreatedAt()->format(\DateTime::ATOM),
            'canvasWidth'=>$org->getCanvasWidth(),
            'canvasHeight'=>$org->getCanvasHeight(),
            'tracingImages'=>$isAdmin? $org->getTracingImages() : null,
        ]);
    }

    /**
     * DELETE /api/organizations/{id}
     * Admin only. Relies on cascade behaviour configured on the entity mapping
     * (Organization -> Building -> Floor -> MapNode -> MapEdge). If cascade isn't
     * configured yet, this will throw a DB FK error - verify entity mapping.
     */
    #[Route('/{id}', name:'remove_organization',methods: ['DELETE'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_ADMIN')]
    public function delete(int $id): JsonResponse
    {
        $org = $this->em->getRepository(Organization::class)->find($id);

        if (!$org) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Organization not found.', 'NOT_FOUND', 404),
                404
            );
        }

        try {
            $this->em->remove($org);
            $this->em->flush();
        } catch (\Exception $e) {
            // Likely a FK constraint violation if cascade isn't set up.
            return new JsonResponse(
                $this->errorFormatter->formatError(
                    'Unable to delete organization; it may still have dependent buildings.',
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
     * Admin: all buildings (DRAFT + PUBLISHED).
     * Public/user: PUBLISHED only.
     */
    #[Route('/{id}/buildings', name:'get_buildings_organization',methods: ['GET'], requirements: ['id' => '\d+'])]
    public function buildings(int $id): JsonResponse
    {
        $org = $this->em->getRepository(Organization::class)->find($id);

        if (!$org) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Organization not found.', 'NOT_FOUND', 404),
                404
            );
        }

        $isAdmin = $this->isGranted('ROLE_ADMIN');

        $buildings = $isAdmin
            ? $this->em->getRepository(Building::class)->findBy(['organization' => $org])
            : $this->em->getRepository(Building::class)->findBy(['organization' => $org, 'status' => 'PUBLISHED']);

        $data = array_map(fn(Building $b) => [
            'id' => $b->getId(),
            'name' => $b->getName(),
            'status' => $b->getStatus(),
            'color'=> $b->getColor(),
            'description'=>$b->getDescription(),
            'geometry'=>$b->getGeometry(),
            'createdAt'=>$b->getCreatedAt(),
            'updatedAt'=>$b->getUpdatedAt()
        ], $buildings);

        return new JsonResponse($data);
    }

    /**
     * POST /api/organizations/{id}/publish
     * Admin only. Publishes every building belonging to the organization.
     * Uses PublishService (which internally runs MapValidationService) per building,
     * so validation rules stay centralized - no duplicated logic here.
     * Returns a per-building result so the admin can see which ones failed and why.
     */
    #[Route('/{id}/publish', name:'publish_all_buildings_in_organization',methods: ['POST'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_ADMIN')]
    public function publishAll(int $id): JsonResponse
    {
        $org = $this->em->getRepository(Organization::class)->find($id);

        if (!$org) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Organization not found.', 'NOT_FOUND', 404),
                404
            );
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
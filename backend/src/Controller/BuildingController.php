<?php

namespace App\Controller;

use App\Entity\Building;
use App\Entity\Organization;
use App\Entity\Floor;
use App\Service\BuildingService;
use App\Service\PublishService;
use App\Service\ErrorFormatter;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\HttpFoundation\Response;

#[Route('/api')]
class BuildingController extends AbstractController
{
    public function __construct(
        private EntityManagerInterface $em,
        private BuildingService $buildingService,
        private PublishService $publishService,
        private ErrorFormatter $errorFormatter,
    ) {}

    /**
     * POST /api/buildings
     * Admin only.
     * Body: { "organizationId": int, "name": string, "description"?: string, "geometry"?: array }
     */

    // possible to create a building even without geometry ( borders )
    #[Route('/buildings', name:'create_building',methods: ['POST'])]
    #[IsGranted('ROLE_ADMIN')]
    public function create(Request $request): JsonResponse
    {
        $payload = json_decode($request->getContent(), true);

        if (!$payload || empty($payload['organizationId']) || empty($payload['name'])) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Fields "organizationId" and "name" are required.', 'VALIDATION_ERROR', 400),
                400
            );
        }

        $organization = $this->em->getRepository(Organization::class)->find($payload['organizationId']);
        if (!$organization) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Organization not found.', 'NOT_FOUND', 404),
                404
            );
        }

        if( strtoupper($payload['name'])=='DEFAULT CAMPUS'){ 
            $campusExisting = $this->em->getRepository(Building::class)->findOneBy(['name'=>'Default Campus', 'organization'=>$organization]); 
            if($campusExisting) return $this->json($this->errorFormatter->formatError('an organization can contain one single default campus','CONFLICT',Response::HTTP_CONFLICT),Response::HTTP_CONFLICT);
        }

        $validColor = false;
        if(!empty($payload['color'])) $validColor = preg_match('/^#[a-fA-F0-9]{6}$/', $payload['color']);

        $building = $this->buildingService->createBuilding(
            $organization,
            $payload['name'],
            $payload['description'] ?? null,
            $payload['geometry'] ?? null,
            $validColor? $payload['color'] : null
        );

        return new JsonResponse($this->serializeBuilding($building), 201);
    }

    /**
     * GET /api/buildings/{id}
     * Admin: always visible.
     * Public/user: only if status === PUBLISHED, otherwise 404 (don't leak existence of drafts).
     */
    #[Route('/buildings/{id}', name:'get_building_by_id',methods: ['GET'], requirements: ['id' => '\d+'])]
    public function getOne(int $id): JsonResponse
    {
        $building = $this->buildingService->findBuilding($id);

        if (!$building || (!$this->isGranted('ROLE_ADMIN') && $building->getStatus() !== 'PUBLISHED')) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Building not found.', 'NOT_FOUND', 404),
                404
            );
        }

        return new JsonResponse($this->serializeBuilding($building));
    }

    /**
     * PUT /api/buildings/{id}
     * Admin only. Basic metadata update (name/description/geometry).
     * Not explicitly in the endpoint table but the plan (9.1 BuildingService)
     * mentions "update basic building metadata if required".
     */

    // possible to use to update the geometry of the building
    #[Route('/buildings/{id}', name:'update_building',methods: ['PUT'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_ADMIN')]
    public function update(int $id, Request $request): JsonResponse
    {
        $building = $this->buildingService->findBuilding($id);
        if (!$building) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Building not found.', 'NOT_FOUND', 404),
                404
            );
        }

        $payload = json_decode($request->getContent(), true) ?? [];
        $building = $this->buildingService->updateBuilding($building, $payload);

        return new JsonResponse($this->serializeBuilding($building));
    }

    /**
     * POST /api/buildings/{id}/publish
     * Admin only. Runs MapValidationService internally via PublishService.
     */

    // puglishes a building to be visible to the users in the organization
    #[Route('/buildings/{id}/publish', name:'publish_building',methods: ['POST'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_ADMIN')]
    public function publish(int $id): JsonResponse
    {
        $building = $this->buildingService->findBuilding($id);
        if (!$building) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Building not found.', 'NOT_FOUND', 404),
                404
            );
        }

        $result = $this->publishService->publish($building);

        if (!$result['success']) {
            return new JsonResponse(
                $this->errorFormatter->formatError(
                    implode(' ', $result['errors']),
                    'VALIDATION_ERROR',
                    422
                ) + ['errors' => $result['errors']],
                422
            );
        }

        return new JsonResponse($this->serializeBuilding($building));
    }

    /**
     * GET /api/map/{id}?type=building|organization
     *
     * Returns the full graph hierarchy (floors + nodes + edges) needed by React Flow
     * to render without follow-up requests, per plan section 10.3.
     * "type" query param disambiguates whether {id} is a buildingId or organizationId.
     * Defaults to "building" if not provided.
     *
     * Admin: full hierarchy including DRAFT buildings.
     * Public/user: only PUBLISHED buildings/floors are included.
     *
     * NOTE: placed here (not a dedicated MapController) since no MapController was
     * created in the project; move if you'd prefer a separate controller.
     */
    #[Route('/map/{id}', name:'get_map',methods: ['GET'], requirements: ['id' => '\d+'])]
    public function getMap(int $id, Request $request): JsonResponse
    {
        $type = $request->query->get('type', 'building');
        $isAdmin = $this->isGranted('ROLE_ADMIN');

        if ($type === 'organization') {
            $organization = $this->em->getRepository(Organization::class)->find($id);
            if (!$organization) {
                return new JsonResponse(
                    $this->errorFormatter->formatError('Organization not found.', 'NOT_FOUND', 404),
                    404
                );
            }

            $buildings = $isAdmin
                ? $this->em->getRepository(Building::class)->findBy(['organization' => $organization])
                : $this->em->getRepository(Building::class)->findBy(['organization' => $organization, 'status' => 'PUBLISHED']);

            $floorsToSerialize = [];
            foreach ($buildings as $building) {
                foreach ($building->getFloors() as $floor) {
                    $floorsToSerialize[] = $floor;
                }
            }
            $floors = $this->serializeFloorsWithGraph($floorsToSerialize);

            return new JsonResponse([
                'buildings' => array_map(fn(Building $b) => [
                    'id' => $b->getId(),
                    'name' => $b->getName(),
                    'status' => $b->getStatus(),
                    'color'=> $b->getColor(),
                    'description'=>$b->getDescription(),
                    'geometry'=>$b->getGeometry(),
                    'createdAt'=>$b->getCreatedAt(),
                    'updatedAt'=>$b->getUpdatedAt()
                ], $buildings),
                'floors' => $floors,
            ]);
        }

        // type === 'building'
        $building = $this->buildingService->findBuilding($id);
        if (!$building || (!$isAdmin && $building->getStatus() !== 'PUBLISHED')) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Building not found.', 'NOT_FOUND', 404),
                404
            );
        }

        $floors = $this->serializeFloorsWithGraph($building->getFloors());

        return new JsonResponse([
            'building' => [
                'id' => $building->getId(),
                'organizationId'=>$building->getOrganization()->getId(),
                'name' => $building->getName(),
                'status' => $building->getStatus(),
                'color'=> $building->getColor(),
                'description'=>$building->getDescription(),
                'geometry'=>$building->getGeometry(),
                'createdAt'=>$building->getCreatedAt(),
                'updatedAt'=>$building->getUpdatedAt()
            ],
            'floors' => $floors,
        ]);
    }

    #[Route('/buildings/{id}',name:'delete_building',methods:['DELETE'])]
    #[IsGranted('ROLE_ADMIN')]
    public function deleteBuilding(int $id) : JsonResponse {
        $building = $this->buildingService->findBuilding($id);
        if(!$building) return new JsonResponse(
            $this->errorFormatter->formatError('Building not found.', 'NOT_FOUND', 404),
            404
        );

        try {
            $this->buildingService->deleteBuilding($building);
        } catch (\Throwable $e) {
            return new JsonResponse(
                $this->errorFormatter->formatError(
                    'Unable to delete building.',
                    'CONFLICT',
                    409
                ),
                409
            );
        }

        return new JsonResponse(null, 204);


    }

    // --- helpers -----------------------------------------------------------

    private function serializeBuilding(Building $building): array
    {
        return [
            'id' => $building->getId(),
            'organizationId' => $building->getOrganization()->getId(),
            'name' => $building->getName(),
            'description' => $building->getDescription(),
            'status' => $building->getStatus(),
            'geometry' => $building->getGeometry(),
            'color' => $building->getColor(),
        ];
    }

    /**
     * Serializes a floor including its nodes and the edges that originate
     * from nodes on this floor (edges can be cross-floor/cross-building,
     * see MapEdge notes in entities_mapforge.md).
     */
    private function serializeFloorWithGraph(Floor $floor): array
    {
        return $this->serializeFloorsWithGraph([$floor])[0];
    }

    private function serializeFloorsWithGraph(iterable $floors): array
    {
        $isAdmin = $this->isGranted('ROLE_ADMIN');
        $serializedFloors = [];
        $nodeIds = [];
        $floorIdsByNodeId = [];

        foreach ($floors as $floor) {
            $floorNodeIds = [];
            $nodes = [];
            foreach ($floor->getMapNodes() as $node) {
                $nodeId = $node->getId();
                $nodeIds[] = $nodeId;
                $floorNodeIds[] = $nodeId;
                $nodes[] = [
                    'id' => $nodeId,
                    'externalIdentifier' => $node->getExternalIdentifier(),
                    'name' => $node->getName(),
                    'type' => $node->getType(),
                    'xCoord' => $node->getXCoord(),
                    'yCoord' => $node->getYCoord(),
                    'geometry'=>$node->getGeometry(),
                    'metadata' => $node->getMetadata(),
                ];
            }

            $floorId = $floor->getId();
            foreach ($floorNodeIds as $nodeId) {
                $floorIdsByNodeId[$nodeId][] = $floorId;
            }
            $serializedFloors[$floorId] = [
                'id' => $floorId,
                'buildingId' => $floor->getBuilding()->getId(),
                'buildingName' => $floor->getBuilding()->getName(),
                'name' => $floor->getName(),
                'floorNumber' => $floor->getFloorNumber(),
                'geometry' => $floor->getGeometry(),
                'nodes' => $nodes,
                'edges' => [],
            ];
        }

        $nodeIds = array_values(array_unique($nodeIds));
        if (!empty($nodeIds)) {
            $qb = $this->em->createQueryBuilder();
            $edgeQb = $qb->select('e')
                ->from(\App\Entity\MapEdge::class, 'e')
                ->join('e.fromNode', 'fn')->join('fn.floor', 'ff')->join('ff.building', 'fb')
                ->join('e.toNode', 'tn')->join('tn.floor', 'tf')->join('tf.building', 'tb')
                ->where($qb->expr()->orX(
                    $qb->expr()->in('IDENTITY(e.fromNode)', ':nodeIds'),
                    $qb->expr()->in('IDENTITY(e.toNode)', ':nodeIds')
                ))
                ->setParameter('nodeIds', $nodeIds);

            if (!$isAdmin) {
                $edgeQb->andWhere('fb.status = :published')
                       ->andWhere('tb.status = :published')
                       ->setParameter('published', 'PUBLISHED');
            }

            $edgeEntities = $edgeQb->getQuery()->getResult();

            foreach ($edgeEntities as $edge) {
                $edgeData = [
                    'id' => $edge->getId(),
                    'fromNodeId' => $edge->getFromNode()->getId(),
                    'toNodeId' => $edge->getToNode()->getId(),
                    'distance' => $edge->getDistance(),
                    'bidirectional' => $edge->isBidirectional(),
                    'accessible' => $edge->isAccessible(),
                ];

                $edgeFloorIds = array_unique(array_merge(
                    $floorIdsByNodeId[$edgeData['fromNodeId']] ?? [],
                    $floorIdsByNodeId[$edgeData['toNodeId']] ?? []
                ));
                foreach ($edgeFloorIds as $floorId) {
                    if (isset($serializedFloors[$floorId])) {
                        $serializedFloors[$floorId]['edges'][] = $edgeData;
                    }
                }
            }
        }

        return array_values($serializedFloors);
    }
}

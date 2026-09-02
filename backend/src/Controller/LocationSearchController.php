<?php

namespace App\Controller;

use App\Entity\MapNode;
use App\Entity\Building;
use App\Entity\Organization;
use App\Service\ErrorFormatter;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/locations')]
class LocationSearchController extends AbstractController
{
    // NOTE: No dedicated search service was provided, so the query is built directly
    // here with QueryBuilder. If search logic grows, extract into a LocationSearchService
    // to keep the controller thin, per the architecture rules.
    public function __construct(
        private EntityManagerInterface $em,
        private ErrorFormatter $errorFormatter,
    ) {}

    /**
     * GET /api/locations/search?q=classroom&buildingId=1&organizationId=2
     * Public. Accepts either buildingId or organizationId as scope (plan §15).
     * Searches MapNode.name and MapNode.externalIdentifier (case-insensitive, LIKE).
     * Pass includeBuildings=true to also search Building.name and Building.description.
     * Public/user callers only get results from PUBLISHED buildings; admin gets everything.
     */
    #[Route('/search', name:'search_node',methods: ['GET'])]
    public function search(Request $request): JsonResponse
    {
        $q = trim((string) $request->query->get('q', ''));
        $buildingId = $request->query->get('buildingId');
        $organizationId = $request->query->get('organizationId');
        $includeBuildings = filter_var($request->query->get('includeBuildings', false), FILTER_VALIDATE_BOOLEAN);
        $searchNodes = !$includeBuildings || strlen($q) >= 2;

        if ($q === '') {
            return new JsonResponse(
                $this->errorFormatter->formatError('Query param "q" is required.', 'VALIDATION_ERROR', 400),
                400
            );
        }

        if (!$buildingId && !$organizationId) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Either "buildingId" or "organizationId" is required.', 'VALIDATION_ERROR', 400),
                400
            );
        }

        $nodeQb = null;
        if ($searchNodes) {
            $nodeQb = $this->em->createQueryBuilder();
            $nodeQb->select('n')
                ->from(MapNode::class, 'n')
                ->join('n.floor', 'f')
                ->join('f.building', 'b')
                ->andWhere($nodeQb->expr()->orX(
                    $nodeQb->expr()->like('LOWER(n.name)', ':q'),
                    $nodeQb->expr()->like('LOWER(n.externalIdentifier)', ':q')
                ))
                ->setParameter('q', '%' . strtolower($q) . '%');
        }

        $building = null;
        $organization = null;
        if ($buildingId) {
            $building = $this->em->getRepository(Building::class)->find($buildingId);
            if (!$building) {
                return new JsonResponse(
                    $this->errorFormatter->formatError('Building not found.', 'NOT_FOUND', 404),
                    404
                );
            }
            if ($nodeQb) {
                $nodeQb->andWhere('b = :building')->setParameter('building', $building);
            }
        } elseif ($organizationId) {
            $organization = $this->em->getRepository(Organization::class)->find($organizationId);
            if (!$organization) {
                return new JsonResponse(
                    $this->errorFormatter->formatError('Organization not found.', 'NOT_FOUND', 404),
                    404
                );
            }
            if ($nodeQb) {
                $nodeQb->andWhere('b.organization = :organization')->setParameter('organization', $organization);
            }
        }

        if ($nodeQb && !$this->isGranted('ROLE_ADMIN')) {
            $nodeQb->andWhere('b.status = :published')->setParameter('published', 'PUBLISHED');
        }

        $nodes = [];
        if ($nodeQb) {
            $nodeQb->setMaxResults($includeBuildings ? 14 : 20); // keep results compact for dropdowns / agent responses (plan §15)

            $nodes = $nodeQb->getQuery()->getResult();
        }

        $data = array_map(fn(MapNode $n) => [
            'kind' => 'node',
            'id' => $n->getId(),
            'identifier' => $n->getExternalIdentifier(),
            'name' => $n->getName(),
            'type' => $n->getType(),
            'floorId' => $n->getFloor()->getId(),
            'buildingId' => $n->getFloor()->getBuilding()->getId(),
            'geometry'=>$n->getGeometry(),
            'xCoord' => $n->getXCoord(),
            'yCoord' => $n->getYCoord(),
        ], $nodes);

        if ($includeBuildings) {
            $buildingQb = $this->em->createQueryBuilder();
            $buildingQb->select('building')
                ->from(Building::class, 'building')
                ->andWhere($buildingQb->expr()->orX(
                    $buildingQb->expr()->like('LOWER(building.name)', ':q'),
                    $buildingQb->expr()->like('LOWER(building.description)', ':q')
                ))
                ->setParameter('q', '%' . strtolower($q) . '%')
                ->setMaxResults(6);

            if ($building) {
                $buildingQb->andWhere('building = :building')->setParameter('building', $building);
            } elseif ($organization) {
                $buildingQb->andWhere('building.organization = :organization')->setParameter('organization', $organization);
            }

            if (!$this->isGranted('ROLE_ADMIN')) {
                $buildingQb->andWhere('building.status = :published')->setParameter('published', 'PUBLISHED');
            }

            $buildings = $buildingQb->getQuery()->getResult();
            $buildingData = array_map(fn(Building $building) => [
                'kind' => 'building',
                'id' => $building->getId(),
                'identifier' => null,
                'name' => $building->getName(),
                'type' => 'Building',
                'organizationId' => $building->getOrganization()->getId(),
                'geometry' => $building->getGeometry(),
                'color' => $building->getColor(),
                'status' => $building->getStatus(),
            ], $buildings);

            $data = array_slice(array_merge($buildingData, $data), 0, 20);
        }

        return new JsonResponse($data);
    }
}

<?php
namespace App\Service;

use App\Entity\Building;
use App\Entity\MapEdge;
use Doctrine\ORM\EntityManagerInterface;

class MapValidationService
{
    public function __construct(private EntityManagerInterface $em) {}

    /**
     * @return array{valid: bool, errors: string[]}
     */
    public function validate(Building $building): array
    {
        $errors = [];

        $floors = $building->getFloors();
        if (count($floors) === 0) {
            $errors[] = 'Building has no floors.';
            return ['valid' => false, 'errors' => $errors];
        }

        $allNodes = [];
        foreach ($floors as $floor) {
            foreach ($floor->getMapNodes() as $node) {
                $allNodes[] = $node;
            }
        }

        if (count($allNodes) === 0) {
            $errors[] = 'Building has no navigable nodes.';
            return ['valid' => false, 'errors' => $errors];
        }

        $hasAccessPoint = false;
        foreach ($allNodes as $node) {
            if (in_array($node->getType(), ['ENTRANCE', 'GATE'], true)) {
                $hasAccessPoint = true;
                break;
            }
        }
        if (!$hasAccessPoint) {
            $errors[] = 'Building has no entrance or gate node.';
        }

        // Fetch ALL edges connected to this building (both outgoing and incoming)
        $edges = $this->em->getRepository(MapEdge::class)->createQueryBuilder('e')
            ->join('e.fromNode', 'fn')
            ->join('fn.floor', 'ff')
            ->join('e.toNode', 'tn')
            ->join('tn.floor', 'tf')
            ->where('ff.building = :building OR tf.building = :building')
            ->setParameter('building', $building)
            ->getQuery()
            ->getResult();

        foreach ($edges as $edge) {
            $fromBuilding = $edge->getFromNode()->getFloor()->getBuilding();
            $toBuilding = $edge->getToNode()->getFloor()->getBuilding();
            
            $isCrossBuilding = $fromBuilding->getId() !== $toBuilding->getId();

            if ($edge->getDistance() <= 0) {
                $prefix = $isCrossBuilding ? 'Cross-building edge' : 'Edge';
                $errors[] = "{$prefix} {$edge->getId()} has an invalid distance.";
            }
        }

        if (count($edges) === 0 && count($allNodes) > 1) {
            $errors[] = 'Building has multiple nodes but no connections between them.';
        }

        return ['valid' => count($errors) === 0, 'errors' => $errors];
    }
}
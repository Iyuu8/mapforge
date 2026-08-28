<?php
namespace App\Service;

use App\Entity\Building;
use App\Entity\MapEdge;
use App\Entity\MapNode;
use Doctrine\ORM\EntityManagerInterface;

class RoutingService
{
    public function __construct(private EntityManagerInterface $em) {}

    /**
     * @param bool $includeUnpublished
     *   true  = admin/internal context: no visibility filtering (all buildings considered).
     *   false = regular user/public context: edges/nodes belonging to a non-PUBLISHED
     *           building are excluded from the graph entirely, so the algorithm can
     *           never route a public user THROUGH a draft building as an intermediate
     *           hop, even if the source and destination are both published.
     *
     * @return array{path: MapNode[], totalDistance: float}|null null when unreachable
     */
    public function findRoute(
        MapNode $source,
        MapNode $destination,
        bool $accessibleOnly = false,
        bool $includeUnpublished = false
    ): ?array {
        if ($source->getId() === $destination->getId()) {
            return ['path' => [$source], 'totalDistance' => 0.0];
        }

        // Defense in depth: even though the controller should already reject a
        // request touching a draft building's node for non-admins, the service
        // itself refuses to compute anything if source/destination aren't visible
        // under the requested permission level.
        if (!$includeUnpublished) {
            $sourcePublished = $source->getFloor()->getBuilding()->getStatus() === 'PUBLISHED';
            $destPublished = $destination->getFloor()->getBuilding()->getStatus() === 'PUBLISHED';
            if (!$sourcePublished || !$destPublished) {
                return null;
            }
        }

        $adjacency = $this->buildAdjacencyList(
            $source->getFloor()->getBuilding(),
            $accessibleOnly,
            $includeUnpublished
        );

        $distances = [$source->getId() => 0.0];
        $predecessors = [];
        $visited = [];

        $queue = new \SplPriorityQueue();
        $queue->insert($source->getId(), 0);

        while (!$queue->isEmpty()) {
            $currentId = $queue->extract();

            if (isset($visited[$currentId])) {
                continue; // stale entry
            }
            $visited[$currentId] = true;

            if ($currentId === $destination->getId()) {
                break;
            }

            foreach ($adjacency[$currentId] ?? [] as $neighbor) {
                $newDist = $distances[$currentId] + $neighbor['distance'];
                if (!isset($distances[$neighbor['nodeId']]) || $newDist < $distances[$neighbor['nodeId']]) {
                    $distances[$neighbor['nodeId']] = $newDist;
                    $predecessors[$neighbor['nodeId']] = $currentId;
                    $queue->insert($neighbor['nodeId'], -$newDist); // max-heap: negate
                }
            }
        }

        if (!isset($distances[$destination->getId()])) {
            return null; // unreachable (either genuinely disconnected, or the only
                         // path required passing through a filtered-out draft building)
        }

        $pathIds = [$destination->getId()];
        $current = $destination->getId();
        while ($current !== $source->getId()) {
            $current = $predecessors[$current];
            $pathIds[] = $current;
        }
        $pathIds = array_reverse($pathIds);

        $nodeRepo = $this->em->getRepository(MapNode::class);
        $path = array_map(fn($id) => $nodeRepo->find($id), $pathIds);

        return [
            'path' => $path,
            'totalDistance' => $distances[$destination->getId()],
        ];
    }

    /**
     * Builds the adjacency list used by Dijkstra.
     *
     * NOTE ON SCOPE: this still primarily scopes edges by the SOURCE node's
     * building (ff.building = :building), matching the existing behaviour /
     * known limitation flagged earlier around cross-building routing. What
     * changes here is purely the PUBLISHED-status filtering: when
     * $includeUnpublished is false, both endpoints of every edge must belong
     * to a PUBLISHED building or the edge is dropped from the graph, so it
     * can never be used as a hop - including cross-building edges that would
     * otherwise sneak a public user into a draft building's node.
     */
    private function buildAdjacencyList(Building $building, bool $accessibleOnly, bool $includeUnpublished): array
    {
        $qb = $this->em->getRepository(MapEdge::class)->createQueryBuilder('e')
            ->join('e.fromNode', 'fn')
            ->join('fn.floor', 'ff')
            ->join('ff.building', 'fb')
            ->join('e.toNode', 'tn')
            ->join('tn.floor', 'tf')
            ->join('tf.building', 'tb')
            ->where('fb = :building')
            ->setParameter('building', $building);

        if ($accessibleOnly) {
            $qb->andWhere('e.accessible = true');
        }

        if (!$includeUnpublished) {
            // Both ends of the edge must sit in a published building, otherwise
            // a regular user could be routed into/through a draft building.
            $qb->andWhere('fb.status = :published')
               ->andWhere('tb.status = :published')
               ->setParameter('published', 'PUBLISHED');
        }

        $edges = $qb->getQuery()->getResult();

        $adjacency = [];
        foreach ($edges as $edge) {
            $fromId = $edge->getFromNode()->getId();
            $toId = $edge->getToNode()->getId();
            $distance = $edge->getDistance();

            $adjacency[$fromId][] = ['nodeId' => $toId, 'distance' => $distance];

            if ($edge->isBidirectional()) {
                $adjacency[$toId][] = ['nodeId' => $fromId, 'distance' => $distance];
            }
        }

        return $adjacency;
    }
}
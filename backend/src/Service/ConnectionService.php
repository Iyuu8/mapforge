<?php
namespace App\Service;

use App\Entity\MapEdge;
use App\Entity\MapNode;
use Doctrine\ORM\EntityManagerInterface;

class ConnectionService
{
    public function __construct(private EntityManagerInterface $em) {}

    public function connectNodes(
        MapNode $fromNode,
        MapNode $toNode,
        float $distance,
        bool $bidirectional = true,
        bool $accessible = true
    ): MapEdge {
        if ($distance <= 0) {
            throw new \DomainException('Distance must be strictly greater than zero.');
        }

        if ($fromNode->getId() === $toNode->getId()) {
            throw new \DomainException('A node cannot be connected to itself.');
        }

        $existing = $this->em->getRepository(MapEdge::class)->createQueryBuilder('e')
            ->where('e.fromNode = :from AND e.toNode = :to')
            ->orWhere('e.fromNode = :to AND e.toNode = :from')
            ->setParameter('from', $fromNode)
            ->setParameter('to', $toNode)
            ->getQuery()
            ->getResult();

        if (count($existing) > 0) {
            throw new \DomainException('A connection between these nodes already exists.');
        }

        $edge = new MapEdge();
        $edge->setFromNode($fromNode);
        $edge->setToNode($toNode);
        $edge->setDistance($distance);
        $edge->setBidirectional($bidirectional);
        $edge->setAccessible($accessible);
        $edge->setCreatedAt(new \DateTimeImmutable());
        $edge->setUpdatedAt(new \DateTimeImmutable());

        $this->em->persist($edge);

        // any new connection changes the graph shape on either side revert
        // whichever building(s) it touches back to DRAFT so publishing requires
        // revalidation
        $this->revertBuildingToDraft($fromNode);
        $this->revertBuildingToDraft($toNode);

        $this->em->flush();

        return $edge;
    }

    public function findEdge(int $id): ?MapEdge
    {
        return $this->em->getRepository(MapEdge::class)->find($id);
    }

    public function disconnectNodes(MapEdge $edge): void
    {
        // Capture endpoints before removal so we can still revert their buildings.
        $fromNode = $edge->getFromNode();
        $toNode = $edge->getToNode();

        $this->em->remove($edge);

        // Removing a connection is just as much a structural change as adding one -
        // a published building could silently lose navigability otherwise.
        $this->revertBuildingToDraft($fromNode);
        $this->revertBuildingToDraft($toNode);

        $this->em->flush();
    }

    private function revertBuildingToDraft(MapNode $node): void
    {
        $building = $node->getFloor()->getBuilding();
        $building->setStatus('DRAFT');
        $building->setUpdatedAt(new \DateTimeImmutable());
    }
}
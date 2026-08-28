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

        // depreciated because this restriction breaks the whole point from the app
        /* if ($fromNode->getFloor()->getBuilding()->getId() !== $toNode->getFloor()->getBuilding()->getId()) {
            throw new \DomainException('Both nodes must belong to the same building.');
        } */

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
        $this->em->flush();

        return $edge;
    }

    public function findEdge(int $id): ?MapEdge
    {
        return $this->em->getRepository(MapEdge::class)->find($id);
    }

    public function disconnectNodes(MapEdge $edge): void
    {
        $this->em->remove($edge);
        $this->em->flush();
    }
}
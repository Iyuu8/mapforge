<?php
namespace App\Service;

use App\Entity\Floor;
use App\Entity\MapNode;
use Doctrine\ORM\EntityManagerInterface;

class MapNodeService
{
    private const VALID_TYPES = [
        // Indoor
        'ROOM', 'CORRIDOR_POINT', 'ENTRANCE', 'EXIT',
        'STAIR', 'ELEVATOR', 'RESTROOM', 'CAFETERIA', 'OFFICE',
        // Outdoor 
        'PATH', 'INTERSECTION', 'GATE', 'COURTYARD', 'LANDMARK'
    ];

    public function __construct(
        private EntityManagerInterface $em,
        private LayoutEngine $layoutEngine
    ) {}

    public function createNode(
        Floor $floor,
        string $externalIdentifier,
        string $name,
        string $type,
        ?float $xCoord = null,
        ?float $yCoord = null,
        ?array $metadata = null,
        ?array $geometry = null
    ): MapNode {
        if (!in_array($type, self::VALID_TYPES, true)) {
            throw new \DomainException("Invalid node type: {$type}");
        }

        $existing = $this->em->getRepository(MapNode::class)->findOneBy([
            'floor' => $floor,
            'externalIdentifier' => $externalIdentifier,
        ]);

        if ($existing) {
            throw new \DomainException("A node with identifier {$externalIdentifier} already exists on this floor.");
        }

        if ($xCoord === null || $yCoord === null) {
            $position = $this->layoutEngine->nextPosition($floor);
            $xCoord ??= $position['x'];
            $yCoord ??= $position['y'];
        }

        $node = new MapNode();
        $node->setFloor($floor);
        $node->setExternalIdentifier($externalIdentifier);
        $node->setName($name);
        $node->setType($type);
        $node->setXCoord($xCoord);
        $node->setYCoord($yCoord);
        $node->setMetadata($metadata);
        $node->setGeometry($geometry); // Add this
        $node->setCreatedAt(new \DateTimeImmutable());
        $node->setUpdatedAt(new \DateTimeImmutable());

        $building = $floor->getBuilding();
        $building->setStatus('DRAFT');
        $building->setUpdatedAt(new \DateTimeImmutable());

        $this->em->persist($node);
        $this->em->flush();

        return $node;
    }

    public function findNode(int $id): ?MapNode
    {
        return $this->em->getRepository(MapNode::class)->find($id);
    }

    public function listNodesForFloor(Floor $floor): array
    {
        return $this->em->getRepository(MapNode::class)->findBy(['floor' => $floor]);
    }

    public function updateNode(MapNode $node, array $fields): MapNode
    {
        if (isset($fields['name'])) {
            $node->setName($fields['name']);
        }
        if (isset($fields['type'])) {
            if (!in_array($fields['type'], self::VALID_TYPES, true)) {
                throw new \DomainException("Invalid node type: {$fields['type']}");
            }
            $node->setType($fields['type']);
        }
        if (isset($fields['xCoord'])) {
            $node->setXCoord((float) $fields['xCoord']);
        }
        if (isset($fields['yCoord'])) {
            $node->setYCoord((float) $fields['yCoord']);
        }
        if (array_key_exists('metadata', $fields)) {
            $node->setMetadata($fields['metadata']);
        }
        if (array_key_exists('geometry', $fields)) { 
            $node->setGeometry($fields['geometry']);
        }

        $node->setUpdatedAt(new \DateTimeImmutable());

        $building = $node->getFloor()->getBuilding();
        $building->setStatus('DRAFT');
        $building->setUpdatedAt(new \DateTimeImmutable());

        $this->em->flush();

        return $node;
    }

    /**
     * Deletes a node and reports which edges were removed as a result.
     */
    public function deleteNode(MapNode $node): array
    {
        $edgeRepo = $this->em->getRepository(\App\Entity\MapEdge::class);
        $dependentEdges = array_merge(
            $edgeRepo->findBy(['fromNode' => $node]),
            $edgeRepo->findBy(['toNode' => $node])
        );

        $removedEdgeIds = [];
        foreach ($dependentEdges as $edge) {
            $removedEdgeIds[] = $edge->getId();
            $this->em->remove($edge);
        }

        $building = $node->getFloor()->getBuilding();
        $building->setStatus('DRAFT');
        $building->setUpdatedAt(new \DateTimeImmutable());

        $this->em->remove($node);
        $this->em->flush();

        return $removedEdgeIds;
    }
}
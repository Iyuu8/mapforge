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
            throw new \DomainException('Choose one of the available location types.');
        }

        $existing = $this->em->getRepository(MapNode::class)->findOneBy([
            'floor' => $floor,
            'externalIdentifier' => $externalIdentifier,
        ]);

        if ($existing) {
            throw new \DomainException("Another location on this floor already uses identifier {$externalIdentifier}.");
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
        $node->setGeometry($geometry); 
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
        $originalBuilding = $node->getFloor()->getBuilding();
        if (isset($fields['floorId'])) {
            $floor = $this->em->getRepository(Floor::class)->find((int) $fields['floorId']);
            if (!$floor) {
                throw new \DomainException('Choose an existing floor for this location.');
            }

            $identifier = trim((string) ($fields['externalIdentifier'] ?? $node->getExternalIdentifier()));
            $existing = $this->em->getRepository(MapNode::class)->findOneBy([
                'floor' => $floor,
                'externalIdentifier' => $identifier,
            ]);

            if ($existing && $existing->getId() !== $node->getId()) {
                throw new \DomainException("Another location on this floor already uses identifier {$identifier}.");
            }

            $node->setFloor($floor);
        }

        if (isset($fields['name'])) {
            $node->setName($fields['name']);
        }
        if (isset($fields['externalIdentifier'])) {
            $identifier = trim((string) $fields['externalIdentifier']);
            if ($identifier === '') {
                throw new \DomainException('Give this location an identifier, or leave it blank when creating a new node so MapForge can generate one.');
            }

            $existing = $this->em->getRepository(MapNode::class)->findOneBy([
                'floor' => $node->getFloor(),
                'externalIdentifier' => $identifier,
            ]);

            if ($existing && $existing->getId() !== $node->getId()) {
                throw new \DomainException("Another location on this floor already uses identifier {$identifier}.");
            }

            $node->setExternalIdentifier($identifier);
        }
        if (isset($fields['type'])) {
            if (!in_array($fields['type'], self::VALID_TYPES, true)) {
                throw new \DomainException('Choose one of the available location types.');
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
        if ($originalBuilding->getId() !== $building->getId()) {
            $originalBuilding->setStatus('DRAFT');
            $originalBuilding->setUpdatedAt(new \DateTimeImmutable());
        }
        $building->setStatus('DRAFT');
        $building->setUpdatedAt(new \DateTimeImmutable());

        $this->em->flush();

        return $node;
    }

    /**
     * Deletes a node and reports which edges were removed as a result.
     */
    public function deleteNode(MapNode $node, bool $flush = true): array
    {
        $edgeRepo = $this->em->getRepository(\App\Entity\MapEdge::class);
        $dependentEdges = array_merge(
            $edgeRepo->findBy(['fromNode' => $node]),
            $edgeRepo->findBy(['toNode' => $node])
        );

        $removedEdgeIds = [];
        $seenEdgeIds = [];
        foreach ($dependentEdges as $edge) {
            if (isset($seenEdgeIds[$edge->getId()])) {
                continue;
            }
            $seenEdgeIds[$edge->getId()] = true;
            $removedEdgeIds[] = $edge->getId();
            $this->em->remove($edge);
        }

        $building = $node->getFloor()->getBuilding();
        $building->setStatus('DRAFT');
        $building->setUpdatedAt(new \DateTimeImmutable());

        $this->em->remove($node);
        if ($flush) {
            $this->em->flush();
        }

        return $removedEdgeIds;
    }
}

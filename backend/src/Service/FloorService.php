<?php
namespace App\Service;

use App\Entity\Building;
use App\Entity\Floor;
use Doctrine\ORM\EntityManagerInterface;

class FloorService
{
    public function __construct(
        private EntityManagerInterface $em,
        private MapNodeService $mapNodeService
    ) {}

    public function createFloor(Building $building, string $name, int $floorNumber, ?array $geometry = null): Floor
    {
        $existing = $this->em->getRepository(Floor::class)->findOneBy([
            'building' => $building,
            'floorNumber' => $floorNumber,
        ]);

        if ($existing) {
            throw new \DomainException("This building already has a floor numbered {$floorNumber}. Choose a different floor number.");
        }

        $floor = new Floor();
        $floor->setBuilding($building);
        $floor->setName($name);
        $floor->setFloorNumber($floorNumber);
        $floor->setGeometry($geometry); 
        $floor->setCreatedAt(new \DateTimeImmutable());
        $floor->setUpdatedAt(new \DateTimeImmutable());

        $building->setStatus('DRAFT'); 
        $building->setUpdatedAt(new \DateTimeImmutable());

        $this->em->persist($floor);
        $this->em->flush();

        return $floor;
    }

    public function updateFloor(Floor $floor, array $fields): Floor
    {
        if (isset($fields['name'])) {
            $floor->setName($fields['name']);
        }
        if (isset($fields['floorNumber'])) {
            $floor->setFloorNumber((int) $fields['floorNumber']);
        }
        if (array_key_exists('geometry', $fields)) {
            $floor->setGeometry($fields['geometry']);
        }

        $floor->setUpdatedAt(new \DateTimeImmutable());
        

        $building = $floor->getBuilding();
        $building->setStatus('DRAFT');
        $building->setUpdatedAt(new \DateTimeImmutable());

        $this->em->flush();

        return $floor;
    }

    public function findFloor(int $id): ?Floor
    {
        return $this->em->getRepository(Floor::class)->find($id);
    }

    public function listFloorsForBuilding(Building $building): array
    {
        return $this->em->getRepository(Floor::class)->findBy(
            ['building' => $building],
            ['floorNumber' => 'ASC']
        );
    }

    public function deleteFloor(Floor $floor, bool $flush = true): array
    {
        $removedNodeIds = [];
        $removedEdgeIds = [];
        $building = $floor->getBuilding();

        foreach ($floor->getMapNodes()->toArray() as $node) {
            $removedNodeIds[] = $node->getId();
            $removedEdgeIds = array_merge($removedEdgeIds, $this->mapNodeService->deleteNode($node, false));
        }

        $building->setStatus('DRAFT');
        $building->setUpdatedAt(new \DateTimeImmutable());

        $this->em->remove($floor);

        if ($flush) {
            $this->em->flush();
        }

        return [
            'removedNodeIds' => $removedNodeIds,
            'removedEdgeIds' => array_values(array_unique($removedEdgeIds)),
        ];
    }
}

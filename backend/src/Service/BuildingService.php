<?php
namespace App\Service;

use App\Entity\Building;
use App\Entity\Organization;
use Doctrine\ORM\EntityManagerInterface;

class BuildingService
{
    public function __construct(
        private EntityManagerInterface $em,
        private FloorService $floorService
    ) {}

    public function createBuilding(Organization $organization, string $name, ?string $description = null, ?array $geometry = null, $color = '#3388ff'): Building
    {
        if($color == null) $color = '#3388ff';

        $building = new Building();
        $building->setOrganization($organization);
        $building->setName($name);
        $building->setDescription($description);
        $building->setGeometry($geometry); 
        $building->setStatus('DRAFT');
        $building->setCreatedAt(new \DateTimeImmutable());
        $building->setUpdatedAt(new \DateTimeImmutable());
        $building->setColor($color);

        $this->em->persist($building);
        $this->em->flush();

        return $building;
    }

    public function findBuilding(int $id): ?Building
    {
        return $this->em->getRepository(Building::class)->find($id);
    }

    public function listBuildings(bool $publicOnly = false): array
    {
        $repo = $this->em->getRepository(Building::class);
        if ($publicOnly) {
            return $repo->findBy(['status' => 'PUBLISHED']);
        }
        return $repo->findAll();
    }

    public function updateBuilding(Building $building, array $fields): Building
    {
        if (isset($fields['name'])) {
            $building->setName($fields['name']);
        }
        if (array_key_exists('description', $fields)) {
            $building->setDescription($fields['description']);
        }
        if (array_key_exists('geometry', $fields)) { 
            $building->setGeometry($fields['geometry']);
            $building->setStatus('DRAFT');
        }
        if(isset($fields['color'])){
            $validColor = false;
            $validColor = preg_match('/^#[a-fA-F0-9]{6}$/', $fields['color']);
            $building->setColor($validColor? $fields['color'] : '#3388ff');
        }
        
        $building->setUpdatedAt(new \DateTimeImmutable());
        $this->em->flush();

        return $building;
    }

    public function deleteBuilding(Building $building): array
    {
        $removedFloorIds = [];
        $removedNodeIds = [];
        $removedEdgeIds = [];

        foreach ($building->getFloors()->toArray() as $floor) {
            $removedFloorIds[] = $floor->getId();
            $result = $this->floorService->deleteFloor($floor, false);
            $removedNodeIds = array_merge($removedNodeIds, $result['removedNodeIds']);
            $removedEdgeIds = array_merge($removedEdgeIds, $result['removedEdgeIds']);
        }

        $this->em->remove($building);
        $this->em->flush();

        return [
            'removedFloorIds' => $removedFloorIds,
            'removedNodeIds' => $removedNodeIds,
            'removedEdgeIds' => array_values(array_unique($removedEdgeIds)),
        ];
    }
}

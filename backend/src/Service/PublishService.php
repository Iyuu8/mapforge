<?php
namespace App\Service;

use App\Entity\Building;
use Doctrine\ORM\EntityManagerInterface;
use App\Service\MapValidationService;

class PublishService
{
    public function __construct(
        private EntityManagerInterface $em,
        private MapValidationService $validationService
    ) {}

    /**
     * @return array{success: bool, errors: string[]}
     */
    public function publish(Building $building): array
    {
        $result = $this->validationService->validate($building);

        if (!$result['valid']) {
            return ['success' => false, 'errors' => $result['errors']];
        }

        $building->setStatus('PUBLISHED');
        $building->setUpdatedAt(new \DateTimeImmutable());
        $this->em->flush();

        return ['success' => true, 'errors' => []];
    }
}
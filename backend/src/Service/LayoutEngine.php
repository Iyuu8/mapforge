<?php
namespace App\Service;

use App\Entity\Floor;
use App\Entity\MapNode;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Deterministic, deliberately simple placement for nodes
 * created without explicit coordinates.
 */
class LayoutEngine
{
    private const GRID_SPACING_X = 150.0;
    private const GRID_SPACING_Y = 120.0;
    private const COLUMNS = 5;

    public function __construct(private EntityManagerInterface $em) {}

    public function nextPosition(Floor $floor): array
    {
        $count = $this->em->getRepository(MapNode::class)->count(['floor' => $floor]);

        $column = $count % self::COLUMNS;
        $row = intdiv($count, self::COLUMNS);

        return [
            'x' => $column * self::GRID_SPACING_X + 100,
            'y' => $row * self::GRID_SPACING_Y + 100,
        ];
    }
}
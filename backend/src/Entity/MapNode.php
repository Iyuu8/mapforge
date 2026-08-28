<?php

namespace App\Entity;

use App\Repository\MapNodeRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: MapNodeRepository::class)]
#[ORM\UniqueConstraint(name: 'unique_floor_external_identifier', columns: ['floor_id', 'external_identifier'])]
class MapNode
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 50)]
    private ?string $externalIdentifier = null;

    #[ORM\Column(length: 255)]
    private ?string $name = null;

    #[ORM\Column(length: 30)]
    private ?string $type = null;
    /*
     enum-style: ROOM, CORRIDOR_POINT, ENTRANCE, EXIT, STAIR, ELEVATOR, RESTROOM, CAFETERIA, OFFICE
    */

    #[ORM\Column]
    private ?float $xCoord = null;

    #[ORM\Column]
    private ?float $yCoord = null;

    #[ORM\Column(nullable: true)]
    private ?array $metadata = null;

    #[ORM\Column]
    private ?\DateTimeImmutable $createdAt = null;

    #[ORM\Column]
    private ?\DateTimeImmutable $updatedAt = null;

    #[ORM\ManyToOne(inversedBy: 'mapNodes')]
    #[ORM\JoinColumn(nullable: false)]
    private ?Floor $floor = null;

    #[ORM\Column(nullable: true)]
    private ?array $geometry = null;

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getExternalIdentifier(): ?string
    {
        return $this->externalIdentifier;
    }

    public function setExternalIdentifier(string $externalIdentifier): static
    {
        $this->externalIdentifier = $externalIdentifier;

        return $this;
    }

    public function getName(): ?string
    {
        return $this->name;
    }

    public function setName(string $name): static
    {
        $this->name = $name;

        return $this;
    }

    public function getType(): ?string
    {
        return $this->type;
    }

    public function setType(string $type): static
    {
        $this->type = $type;

        return $this;
    }

    public function getXCoord(): ?float
    {
        return $this->xCoord;
    }

    public function setXCoord(float $xCoord): static
    {
        $this->xCoord = $xCoord;

        return $this;
    }

    public function getYCoord(): ?float
    {
        return $this->yCoord;
    }

    public function setYCoord(float $yCoord): static
    {
        $this->yCoord = $yCoord;

        return $this;
    }

    public function getMetadata(): ?array
    {
        return $this->metadata;
    }

    public function setMetadata(?array $metadata): static
    {
        $this->metadata = $metadata;

        return $this;
    }

    public function getCreatedAt(): ?\DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function setCreatedAt(\DateTimeImmutable $createdAt): static
    {
        $this->createdAt = $createdAt;

        return $this;
    }

    public function getUpdatedAt(): ?\DateTimeImmutable
    {
        return $this->updatedAt;
    }

    public function setUpdatedAt(\DateTimeImmutable $updatedAt): static
    {
        $this->updatedAt = $updatedAt;

        return $this;
    }

    public function getFloor(): ?Floor
    {
        return $this->floor;
    }

    public function setFloor(?Floor $floor): static
    {
        $this->floor = $floor;

        return $this;
    }

    public function getGeometry(): ?array
    {
        return $this->geometry;
    }

    public function setGeometry(?array $geometry): static
    {
        $this->geometry = $geometry;

        return $this;
    }
}

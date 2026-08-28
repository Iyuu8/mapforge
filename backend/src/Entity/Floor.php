<?php

namespace App\Entity;

use App\Repository\FloorRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;


#[ORM\UniqueConstraint(name: 'unique_building_floor', columns: ['building_id', 'floor_number'])]
#[ORM\Entity(repositoryClass: FloorRepository::class)]
class Floor
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column]
    private ?int $floorNumber = null;

    #[ORM\Column(length: 255)]
    private ?string $name = null;

    #[ORM\Column]
    private ?\DateTimeImmutable $createdAt = null;

    #[ORM\Column]
    private ?\DateTimeImmutable $updatedAt = null;

    #[ORM\ManyToOne(inversedBy: 'floors')]
    #[ORM\JoinColumn(nullable: false)]
    private ?Building $building = null;

    /**
     * @var Collection<int, MapNode>
     */
    #[ORM\OneToMany(targetEntity: MapNode::class, mappedBy: 'floor')]
    private Collection $mapNodes;

    #[ORM\Column(nullable: true)]
    private ?array $geometry = null;

    public function __construct()
    {
        $this->mapNodes = new ArrayCollection();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getFloorNumber(): ?int
    {
        return $this->floorNumber;
    }

    public function setFloorNumber(int $floorNumber): static
    {
        $this->floorNumber = $floorNumber;

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

    public function getBuilding(): ?Building
    {
        return $this->building;
    }

    public function setBuilding(?Building $building): static
    {
        $this->building = $building;

        return $this;
    }

    /**
     * @return Collection<int, MapNode>
     */
    public function getMapNodes(): Collection
    {
        return $this->mapNodes;
    }

    public function addMapNode(MapNode $mapNode): static
    {
        if (!$this->mapNodes->contains($mapNode)) {
            $this->mapNodes->add($mapNode);
            $mapNode->setFloor($this);
        }

        return $this;
    }

    public function removeMapNode(MapNode $mapNode): static
    {
        if ($this->mapNodes->removeElement($mapNode)) {
            // set the owning side to null (unless already changed)
            if ($mapNode->getFloor() === $this) {
                $mapNode->setFloor(null);
            }
        }

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

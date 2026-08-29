<?php

namespace App\Entity;

use App\Repository\MapEdgeRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: MapEdgeRepository::class)]
class MapEdge
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column]
    private ?float $distance = null; // must be > 0 enforce in service

    #[ORM\Column]
    private ?bool $bidirectional = true;

    #[ORM\Column(name: '`accessible`')]
    private bool $accessible = true;

    #[ORM\Column]
    private ?\DateTimeImmutable $createdAt = null;

    #[ORM\Column]
    private ?\DateTimeImmutable $updatedAt = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false)]
    private ?MapNode $fromNode = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false)]
    private ?MapNode $toNode = null;

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getDistance(): ?float
    {
        return $this->distance;
    }

    public function setDistance(float $distance): static
    {
        $this->distance = $distance;

        return $this;
    }

    public function isBidirectional(): ?bool
    {
        return $this->bidirectional;
    }

    public function setBidirectional(bool $bidirectional): static
    {
        $this->bidirectional = $bidirectional;

        return $this;
    }

    public function isAccessible(): ?bool
    {
        return $this->accessible;
    }

    public function setAccessible(bool $accessible): static
    {
        $this->accessible = $accessible;

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

    public function getFromNode(): ?MapNode
    {
        return $this->fromNode;
    }

    public function setFromNode(?MapNode $fromNode): static
    {
        $this->fromNode = $fromNode;

        return $this;
    }

    public function getToNode(): ?MapNode
    {
        return $this->toNode;
    }

    public function setToNode(?MapNode $toNode): static
    {
        $this->toNode = $toNode;

        return $this;
    }
}

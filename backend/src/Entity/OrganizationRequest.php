<?php

namespace App\Entity;

use App\Repository\OrganizationRequestRepository;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: OrganizationRequestRepository::class)]
#[ORM\Table(name: 'organization_request')]
class OrganizationRequest
{
    public const STATUS_PENDING = 'PENDING';
    public const STATUS_APPROVED = 'APPROVED';
    public const STATUS_REJECTED = 'REJECTED';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 255)]
    private ?string $organizationName = null;

    #[ORM\Column(length: 255)]
    private ?string $address = null;

    #[ORM\Column(length: 50)]
    private ?string $phone = null;

    #[ORM\Column(length: 180)]
    private ?string $email = null;

    #[ORM\Column(length: 255)]
    private ?string $password = null;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    private ?string $description = null;

    #[ORM\Column(length: 30)]
    private string $status = self::STATUS_PENDING;

    #[ORM\Column]
    private ?\DateTimeImmutable $createdAt = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $reviewedAt = null;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    private ?string $rejectionReason = null;

    #[ORM\ManyToOne(targetEntity: Organization::class)]
    #[ORM\JoinColumn(name: 'created_organization_id', referencedColumnName: 'id', nullable: true, onDelete: 'SET NULL')]
    private ?Organization $createdOrganization = null;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(name: 'created_user_id', referencedColumnName: 'id', nullable: true, onDelete: 'SET NULL')]
    private ?User $createdUser = null;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
        $this->status = self::STATUS_PENDING;
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getOrganizationName(): ?string
    {
        return $this->organizationName;
    }

    public function setOrganizationName(string $organizationName): static
    {
        $this->organizationName = $organizationName;

        return $this;
    }

    public function getAddress(): ?string
    {
        return $this->address;
    }

    public function setAddress(string $address): static
    {
        $this->address = $address;

        return $this;
    }

    public function getPhone(): ?string
    {
        return $this->phone;
    }

    public function setPhone(string $phone): static
    {
        $this->phone = $phone;

        return $this;
    }

    public function getEmail(): ?string
    {
        return $this->email;
    }

    public function setEmail(string $email): static
    {
        $this->email = $email;

        return $this;
    }

    public function getPassword(): ?string
    {
        return $this->password;
    }

    public function setPassword(string $password): static
    {
        $this->password = $password;

        return $this;
    }

    public function getDescription(): ?string
    {
        return $this->description;
    }

    public function setDescription(?string $description): static
    {
        $this->description = $description;

        return $this;
    }

    public function getStatus(): string
    {
        return $this->status;
    }

    public function setStatus(string $status): static
    {
        $this->status = $status;

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

    public function getReviewedAt(): ?\DateTimeImmutable
    {
        return $this->reviewedAt;
    }

    public function setReviewedAt(?\DateTimeImmutable $reviewedAt): static
    {
        $this->reviewedAt = $reviewedAt;

        return $this;
    }

    public function getRejectionReason(): ?string
    {
        return $this->rejectionReason;
    }

    public function setRejectionReason(?string $rejectionReason): static
    {
        $this->rejectionReason = $rejectionReason;

        return $this;
    }

    public function getCreatedOrganization(): ?Organization
    {
        return $this->createdOrganization;
    }

    public function setCreatedOrganization(?Organization $createdOrganization): static
    {
        $this->createdOrganization = $createdOrganization;

        return $this;
    }

    public function getCreatedUser(): ?User
    {
        return $this->createdUser;
    }

    public function setCreatedUser(?User $createdUser): static
    {
        $this->createdUser = $createdUser;

        return $this;
    }
}

<?php

namespace App\Repository;

use App\Entity\OrganizationRequest;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<OrganizationRequest>
 */
class OrganizationRequestRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, OrganizationRequest::class);
    }

    /**
     * @return OrganizationRequest[]
     */
    public function findByStatus(string $status): array
    {
        return $this->createQueryBuilder('r')
            ->andWhere('r.status = :status')
            ->setParameter('status', $status)
            ->orderBy('r.createdAt', 'DESC')
            ->getQuery()
            ->getResult();
    }

    public function findPendingByEmail(string $email): ?OrganizationRequest
    {
        return $this->createQueryBuilder('r')
            ->andWhere('r.email = :email')
            ->andWhere('r.status = :status')
            ->setParameter('email', $email)
            ->setParameter('status', OrganizationRequest::STATUS_PENDING)
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();
    }
}

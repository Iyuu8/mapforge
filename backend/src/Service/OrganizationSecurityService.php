<?php

namespace App\Service;

use App\Entity\Building;
use App\Entity\Floor;
use App\Entity\MapEdge;
use App\Entity\MapNode;
use App\Entity\Organization;
use App\Entity\User;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Security\Core\User\UserInterface;

class OrganizationSecurityService
{
    public function __construct(
        private ErrorFormatter $errorFormatter
    ) {}

    public function isSuperAdmin(?UserInterface $user): bool
    {
        if (!$user instanceof User) {
            return false;
        }

        return in_array('ROLE_SUPER_ADMIN', $user->getRoles(), true);
    }

    public function isOrganizationAdmin(?UserInterface $user): bool
    {
        if (!$user instanceof User) {
            return false;
        }

        return in_array('ROLE_ORGANIZATION', $user->getRoles(), true) || in_array('ROLE_ADMIN', $user->getRoles(), true);
    }

    public function canEditOrganization(?UserInterface $user, ?Organization $organization): bool
    {
        if (!$user instanceof User || !$organization) {
            return false;
        }

        // Super admins have global access
        if ($this->isSuperAdmin($user)) {
            return true;
        }

        // Horizontal authorization: organization account can only edit their own organization
        if (in_array('ROLE_ORGANIZATION', $user->getRoles(), true)) {
            $owner = $organization->getOwner();
            if ($owner && $owner->getId() === $user->getId()) {
                return true;
            }

            return false;
        }

        // Legacy ROLE_ADMIN fallback
        if (in_array('ROLE_ADMIN', $user->getRoles(), true)) {
            $owner = $organization->getOwner();
            if ($owner === null || $owner->getId() === $user->getId()) {
                return true;
            }

            return false;
        }

        return false;
    }

    public function canEditBuilding(?UserInterface $user, ?Building $building): bool
    {
        if (!$building) {
            return false;
        }

        return $this->canEditOrganization($user, $building->getOrganization());
    }

    public function canEditFloor(?UserInterface $user, ?Floor $floor): bool
    {
        if (!$floor) {
            return false;
        }

        return $this->canEditBuilding($user, $floor->getBuilding());
    }

    public function canEditNode(?UserInterface $user, ?MapNode $node): bool
    {
        if (!$node) {
            return false;
        }

        return $this->canEditFloor($user, $node->getFloor());
    }

    public function canEditEdge(?UserInterface $user, ?MapEdge $edge): bool
    {
        if (!$edge) {
            return false;
        }

        return $this->canEditNode($user, $edge->getSourceNode());
    }

    public function checkOrganizationAccess(?UserInterface $user, ?Organization $organization): ?JsonResponse
    {
        if (!$this->canEditOrganization($user, $organization)) {
            return new JsonResponse(
                $this->errorFormatter->formatError(
                    'Horizontal access denied: You cannot modify maps or resources belonging to another organization.',
                    'FORBIDDEN',
                    Response::HTTP_FORBIDDEN
                ),
                Response::HTTP_FORBIDDEN
            );
        }

        return null;
    }

    public function checkBuildingAccess(?UserInterface $user, ?Building $building): ?JsonResponse
    {
        if (!$building) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Building not found.', 'NOT_FOUND', Response::HTTP_NOT_FOUND),
                Response::HTTP_NOT_FOUND
            );
        }

        return $this->checkOrganizationAccess($user, $building->getOrganization());
    }

    public function checkFloorAccess(?UserInterface $user, ?Floor $floor): ?JsonResponse
    {
        if (!$floor) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Floor not found.', 'NOT_FOUND', Response::HTTP_NOT_FOUND),
                Response::HTTP_NOT_FOUND
            );
        }

        return $this->checkBuildingAccess($user, $floor->getBuilding());
    }

    public function checkNodeAccess(?UserInterface $user, ?MapNode $node): ?JsonResponse
    {
        if (!$node) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Node not found.', 'NOT_FOUND', Response::HTTP_NOT_FOUND),
                Response::HTTP_NOT_FOUND
            );
        }

        return $this->checkFloorAccess($user, $node->getFloor());
    }

    public function checkEdgeAccess(?UserInterface $user, ?MapEdge $edge): ?JsonResponse
    {
        if (!$edge) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Edge not found.', 'NOT_FOUND', Response::HTTP_NOT_FOUND),
                Response::HTTP_NOT_FOUND
            );
        }

        return $this->checkNodeAccess($user, $edge->getSourceNode());
    }
}

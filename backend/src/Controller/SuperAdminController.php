<?php

namespace App\Controller;

use App\Entity\Building;
use App\Entity\Organization;
use App\Entity\OrganizationRequest;
use App\Entity\User;
use App\Service\ErrorFormatter;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/super-admin')]
#[IsGranted('ROLE_SUPER_ADMIN')]
class SuperAdminController extends AbstractController
{
    public function __construct(
        private EntityManagerInterface $em,
        private ErrorFormatter $errorFormatter
    ) {}

    /**
     * GET /api/super-admin/requests
     * List organization creation requests with optional status filter.
     */
    #[Route('/requests', name: 'super_admin_list_requests', methods: ['GET'])]
    public function listRequests(Request $request): JsonResponse
    {
        $status = strtoupper(trim((string) $request->query->get('status', 'ALL')));
        $repo = $this->em->getRepository(OrganizationRequest::class);

        if ($status !== '' && $status !== 'ALL') {
            $requests = $repo->findBy(['status' => $status], ['createdAt' => 'DESC']);
        } else {
            $requests = $repo->findBy([], ['createdAt' => 'DESC']);
        }

        $data = array_map(function (OrganizationRequest $req) {
            $org = $req->getCreatedOrganization();
            $user = $req->getCreatedUser();

            return [
                'id' => $req->getId(),
                'organizationName' => $req->getOrganizationName(),
                'address' => $req->getAddress(),
                'phone' => $req->getPhone(),
                'email' => $req->getEmail(),
                'description' => $req->getDescription(),
                'status' => $req->getStatus(),
                'createdAt' => $req->getCreatedAt()?->format(\DateTime::ATOM),
                'reviewedAt' => $req->getReviewedAt()?->format(\DateTime::ATOM),
                'rejectionReason' => $req->getRejectionReason(),
                'createdOrganization' => $org ? [
                    'id' => $org->getId(),
                    'name' => $org->getName(),
                ] : null,
                'createdUser' => $user ? [
                    'id' => $user->getId(),
                    'email' => $user->getEmail(),
                ] : null,
            ];
        }, $requests);

        return new JsonResponse($data);
    }

    /**
     * POST /api/super-admin/requests/{id}/approve
     * Approves an organization request:
     * 1. Creates User account with ROLE_ORGANIZATION
     * 2. Creates Organization linked to the new User
     * 3. Creates Default Campus building
     * 4. Updates request status to APPROVED
     */
    #[Route('/requests/{id}/approve', name: 'super_admin_approve_request', methods: ['POST'], requirements: ['id' => '\d+'])]
    public function approveRequest(int $id): JsonResponse
    {
        $req = $this->em->getRepository(OrganizationRequest::class)->find($id);
        if (!$req) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Organization request not found.', 'NOT_FOUND', Response::HTTP_NOT_FOUND),
                Response::HTTP_NOT_FOUND
            );
        }

        if ($req->getStatus() !== OrganizationRequest::STATUS_PENDING) {
            return new JsonResponse(
                $this->errorFormatter->formatError('This request has already been reviewed (status: ' . $req->getStatus() . ').', 'BAD_REQUEST', Response::HTTP_BAD_REQUEST),
                Response::HTTP_BAD_REQUEST
            );
        }

        $userRepo = $this->em->getRepository(User::class);
        $user = $userRepo->findOneBy(['email' => $req->getEmail()]);

        if (!$user) {
            $user = new User();
            $user->setEmail($req->getEmail());
            $user->setPassword($req->getPassword()); // already hashed upon submission
            $user->setRoles(['ROLE_ORGANIZATION']);
            $user->setCreatedAt(new \DateTimeImmutable());
            $user->setStatus('ACTIVE');
            $this->em->persist($user);
        } else {
            // Add ROLE_ORGANIZATION if not present
            $roles = $user->getRoles();
            if (!in_array('ROLE_ORGANIZATION', $roles, true)) {
                $roles[] = 'ROLE_ORGANIZATION';
                $user->setRoles($roles);
            }
            $user->setStatus('ACTIVE');
        }

        $now = new \DateTimeImmutable();

        // Create the organization
        $org = new Organization();
        $org->setName($req->getOrganizationName());
        $org->setAddress($req->getAddress());
        $org->setPhone($req->getPhone());
        $org->setDescription($req->getDescription());
        $org->setCanvasWidth(8000);
        $org->setCanvasHeight(6000);
        $org->setOwner($user);
        $org->setCreatedAt($now);
        $org->setUpdatedAt($now);
        $this->em->persist($org);

        // Auto-create Default Campus
        $campus = new Building();
        $campus->setName('Default Campus');
        $campus->setDescription('Outdoor section and main campus grounds for ' . $org->getName());
        $campus->setStatus('DRAFT');
        $campus->setOrganization($org);
        $campus->setCreatedAt($now);
        $campus->setUpdatedAt($now);
        $this->em->persist($campus);

        // Update request status
        $req->setStatus(OrganizationRequest::STATUS_APPROVED);
        $req->setReviewedAt($now);
        $req->setCreatedOrganization($org);
        $req->setCreatedUser($user);

        $this->em->flush();

        return new JsonResponse([
            'status' => 'success',
            'message' => 'Organization request approved successfully.',
            'request' => [
                'id' => $req->getId(),
                'status' => $req->getStatus(),
                'reviewedAt' => $req->getReviewedAt()?->format(\DateTime::ATOM),
            ],
            'organization' => [
                'id' => $org->getId(),
                'name' => $org->getName(),
                'address' => $org->getAddress(),
                'phone' => $org->getPhone(),
                'owner' => [
                    'id' => $user->getId(),
                    'email' => $user->getEmail(),
                ],
            ],
        ], Response::HTTP_OK);
    }

    /**
     * POST /api/super-admin/requests/{id}/reject
     * Rejects an organization request with an optional reason.
     */
    #[Route('/requests/{id}/reject', name: 'super_admin_reject_request', methods: ['POST'], requirements: ['id' => '\d+'])]
    public function rejectRequest(int $id, Request $request): JsonResponse
    {
        $req = $this->em->getRepository(OrganizationRequest::class)->find($id);
        if (!$req) {
            return new JsonResponse(
                $this->errorFormatter->formatError('Organization request not found.', 'NOT_FOUND', Response::HTTP_NOT_FOUND),
                Response::HTTP_NOT_FOUND
            );
        }

        if ($req->getStatus() !== OrganizationRequest::STATUS_PENDING) {
            return new JsonResponse(
                $this->errorFormatter->formatError('This request has already been reviewed (status: ' . $req->getStatus() . ').', 'BAD_REQUEST', Response::HTTP_BAD_REQUEST),
                Response::HTTP_BAD_REQUEST
            );
        }

        $payload = json_decode($request->getContent(), true) ?? [];
        $reason = trim($payload['reason'] ?? 'Request rejected by super admin.');

        $req->setStatus(OrganizationRequest::STATUS_REJECTED);
        $req->setRejectionReason($reason);
        $req->setReviewedAt(new \DateTimeImmutable());

        $this->em->flush();

        return new JsonResponse([
            'status' => 'success',
            'message' => 'Organization request rejected.',
            'request' => [
                'id' => $req->getId(),
                'status' => $req->getStatus(),
                'rejectionReason' => $req->getRejectionReason(),
                'reviewedAt' => $req->getReviewedAt()?->format(\DateTime::ATOM),
            ],
        ], Response::HTTP_OK);
    }

    /**
     * GET /api/super-admin/stats
     * Return platform statistics for Super Admin dashboard.
     */
    #[Route('/stats', name: 'super_admin_stats', methods: ['GET'])]
    public function stats(): JsonResponse
    {
        $reqRepo = $this->em->getRepository(OrganizationRequest::class);
        $orgRepo = $this->em->getRepository(Organization::class);
        $userRepo = $this->em->getRepository(User::class);

        $pending = count($reqRepo->findBy(['status' => OrganizationRequest::STATUS_PENDING]));
        $approved = count($reqRepo->findBy(['status' => OrganizationRequest::STATUS_APPROVED]));
        $rejected = count($reqRepo->findBy(['status' => OrganizationRequest::STATUS_REJECTED]));
        $totalOrgs = count($orgRepo->findAll());
        $totalUsers = count($userRepo->findAll());

        return new JsonResponse([
            'pendingRequests' => $pending,
            'approvedRequests' => $approved,
            'rejectedRequests' => $rejected,
            'totalOrganizations' => $totalOrgs,
            'totalUsers' => $totalUsers,
        ]);
    }

    /**
     * GET /api/super-admin/organizations
     * List all organizations with owner details.
     */
    #[Route('/organizations', name: 'super_admin_organizations', methods: ['GET'])]
    public function listAllOrganizations(): JsonResponse
    {
        $organizations = $this->em->getRepository(Organization::class)->findAll();

        $data = array_map(function (Organization $org) {
            $owner = $org->getOwner();
            return [
                'id' => $org->getId(),
                'name' => $org->getName(),
                'description' => $org->getDescription(),
                'address' => $org->getAddress(),
                'phone' => $org->getPhone(),
                'canvasWidth' => $org->getCanvasWidth(),
                'canvasHeight' => $org->getCanvasHeight(),
                'buildingCount' => $org->getBuildings()->count(),
                'createdAt' => $org->getCreatedAt()?->format(\DateTime::ATOM),
                'owner' => $owner ? [
                    'id' => $owner->getId(),
                    'email' => $owner->getEmail(),
                ] : null,
            ];
        }, $organizations);

        return new JsonResponse($data);
    }
}

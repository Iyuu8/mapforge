<?php

namespace App\Controller;

use App\Entity\Organization;
use App\Entity\OrganizationRequest;
use App\Entity\User;
use App\Service\ErrorFormatter;
use Doctrine\ORM\EntityManagerInterface;
use Gesdinet\JWTRefreshTokenBundle\Model\RefreshTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Cookie;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

final class UserController extends AbstractController
{
    /**
     * Regular User Registration (instant active account with ROLE_USER)
     */
    #[Route('/api/register', name: 'app_user_register', methods: ['POST'])]
    #[IsGranted('PUBLIC_ACCESS')]
    public function register(
        Request $request,
        EntityManagerInterface $manager,
        ErrorFormatter $errorFormatter,
        UserPasswordHasherInterface $userPasswordHasher
    ): JsonResponse {
        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) {
            return $this->json($errorFormatter->formatError('malformed request', 'BAD_REQUEST', Response::HTTP_BAD_REQUEST), Response::HTTP_BAD_REQUEST);
        }

        $email = strtolower(trim($data['email'] ?? ''));
        $plainPassword = trim($data['password'] ?? '');
        if (!$email || !$plainPassword) {
            return $this->json($errorFormatter->formatError('missing required fields', 'BAD_REQUEST', Response::HTTP_BAD_REQUEST), Response::HTTP_BAD_REQUEST);
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return $this->json($errorFormatter->formatError('The provided email address is invalid', 'INVALID_EMAIL', 400), 400);
        }
        if (strlen($plainPassword) < 8) {
            return $this->json($errorFormatter->formatError('Password must be at least 8 characters long', 'WEAK_PASSWORD', 400), 400);
        }

        $userRepository = $manager->getRepository(User::class);
        $user = $userRepository->findOneBy(['email' => $email]);
        if ($user) {
            return $this->json($errorFormatter->formatError("User with email $email already exists", 'USER_ALREADY_EXISTS', 409), 409);
        }

        $pendingReq = $manager->getRepository(OrganizationRequest::class)->findOneBy([
            'email' => $email,
            'status' => OrganizationRequest::STATUS_PENDING,
        ]);
        if ($pendingReq) {
            return $this->json($errorFormatter->formatError('A pending organization registration request with this email already exists.', 'PENDING_REQUEST_EXISTS', 409), 409);
        }

        $user = new User();
        $user->setEmail($email);
        $user->setRoles(['ROLE_USER']);
        $user->setPassword($userPasswordHasher->hashPassword($user, $plainPassword));
        $user->setCreatedAt(new \DateTimeImmutable());
        $user->setStatus('ACTIVE');

        $manager->persist($user);
        $manager->flush();

        return $this->json([
            'status' => 'success',
            'message' => 'User account successfully registered.',
            'user' => [
                'id' => $user->getId(),
                'email' => $user->getEmail(),
                'roles' => $user->getRoles(),
                'createdAt' => $user->getCreatedAt(),
            ],
        ], 201);
    }

    /**
     * Organization Account Request Registration
     * Requires: organizationName, address, phone, email, password, description?
     * Creation does NOT happen directly; it requires Super Admin review and validation.
     */
    #[Route('/api/register/organization', name: 'app_organization_register', methods: ['POST'])]
    #[IsGranted('PUBLIC_ACCESS')]
    public function registerOrganization(
        Request $request,
        EntityManagerInterface $manager,
        ErrorFormatter $errorFormatter,
        UserPasswordHasherInterface $userPasswordHasher
    ): JsonResponse {
        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) {
            return $this->json($errorFormatter->formatError('malformed request', 'BAD_REQUEST', Response::HTTP_BAD_REQUEST), Response::HTTP_BAD_REQUEST);
        }

        $email = strtolower(trim($data['email'] ?? ''));
        $plainPassword = trim($data['password'] ?? '');
        $orgName = trim($data['organizationName'] ?? '');
        $address = trim($data['address'] ?? '');
        $phone = trim($data['phone'] ?? '');
        $description = trim($data['description'] ?? '');

        if (!$email || !$plainPassword || !$orgName || !$address || !$phone) {
            return $this->json($errorFormatter->formatError('Missing required fields: organizationName, address, phone, email, and password are required.', 'MISSING_FIELDS', 400), 400);
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return $this->json($errorFormatter->formatError('The provided email address is invalid', 'INVALID_EMAIL', 400), 400);
        }

        if (strlen($plainPassword) < 8) {
            return $this->json($errorFormatter->formatError('Password must be at least 8 characters long', 'WEAK_PASSWORD', 400), 400);
        }

        // Check if an account with this email already exists
        $user = $manager->getRepository(User::class)->findOneBy(['email' => $email]);
        if ($user) {
            return $this->json($errorFormatter->formatError("An account with email $email already exists.", 'USER_ALREADY_EXISTS', 409), 409);
        }

        // Check if a pending organization request with this email already exists
        $existingReq = $manager->getRepository(OrganizationRequest::class)->findOneBy([
            'email' => $email,
            'status' => OrganizationRequest::STATUS_PENDING,
        ]);
        if ($existingReq) {
            return $this->json($errorFormatter->formatError('An organization request with this email is already awaiting Super Admin review.', 'PENDING_REQUEST_EXISTS', 409), 409);
        }

        // Create the pending OrganizationRequest
        $orgRequest = new OrganizationRequest();
        $orgRequest->setOrganizationName($orgName);
        $orgRequest->setAddress($address);
        $orgRequest->setPhone($phone);
        $orgRequest->setEmail($email);
        $orgRequest->setDescription($description !== '' ? $description : null);

        // Hash the password so it's securely stored until approval
        $dummyUser = new User();
        $hashedPassword = $userPasswordHasher->hashPassword($dummyUser, $plainPassword);
        $orgRequest->setPassword($hashedPassword);

        $manager->persist($orgRequest);
        $manager->flush();

        return $this->json([
            'status' => 'success',
            'message' => 'Organization account request submitted successfully. A Super Admin will review and validate your request before your account is activated.',
            'data' => [
                'id' => $orgRequest->getId(),
                'organizationName' => $orgRequest->getOrganizationName(),
                'email' => $orgRequest->getEmail(),
                'status' => $orgRequest->getStatus(),
                'createdAt' => $orgRequest->getCreatedAt()->format(\DateTime::ATOM),
            ],
        ], 201);
    }

    #[Route('/api/user', name: 'get_current_user', methods: ['GET'])]
    public function getCurrentUser(EntityManagerInterface $manager): JsonResponse
    {
        $user = $this->getUser();
        if (!$user || !$user instanceof User) {
            return $this->json([
                'status' => 'success',
                'data' => [
                    'roles' => ['ROLE_GUEST'],
                    'isAuthenticated' => false,
                    'isSuperAdmin' => false,
                    'isOrganization' => false,
                    'isAdmin' => false,
                    'ownedOrganizations' => [],
                ],
            ], Response::HTTP_OK);
        }

        $roles = $user->getRoles();
        $isSuperAdmin = in_array('ROLE_SUPER_ADMIN', $roles, true);
        $isOrganization = in_array('ROLE_ORGANIZATION', $roles, true);
        $isAdmin = $isSuperAdmin || $isOrganization || in_array('ROLE_ADMIN', $roles, true);

        // Fetch organizations owned by this user
        $ownedOrgs = $manager->getRepository(Organization::class)->findBy(['owner' => $user]);
        $ownedOrgsData = array_map(fn(Organization $o) => [
            'id' => $o->getId(),
            'name' => $o->getName(),
            'description' => $o->getDescription(),
        ], $ownedOrgs);

        return $this->json([
            'status' => 'success',
            'data' => [
                'id' => $user->getId(),
                'email' => $user->getEmail(),
                'roles' => $roles,
                'isAuthenticated' => true,
                'isSuperAdmin' => $isSuperAdmin,
                'isOrganization' => $isOrganization,
                'isAdmin' => $isAdmin,
                'ownedOrganizations' => $ownedOrgsData,
                'createdAt' => $user->getCreatedAt(),
            ],
        ], 200);
    }

    #[Route('/api/logout', name: 'user_logout', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function logout(Request $request, RefreshTokenManagerInterface $refreshTokenManager): JsonResponse
    {
        $refreshTokenString = $request->cookies->get('refresh_token');

        if ($refreshTokenString) {
            $refreshToken = $refreshTokenManager->get($refreshTokenString);
            if ($refreshToken) {
                $refreshTokenManager->delete($refreshToken);
            }
        }

        $response = new JsonResponse([
            'status' => 'success',
            'message' => 'User logged out successfully',
        ]);

        $response->headers->clearCookie(
            'AUTH_BEARER',
            '/',
            null,
            true,
            true,
            Cookie::SAMESITE_NONE
        );
        $response->headers->clearCookie(
            'refresh_token',
            '/',
            null,
            true,
            true,
            Cookie::SAMESITE_NONE
        );

        return $response;
    }
}

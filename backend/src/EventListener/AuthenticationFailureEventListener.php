<?php

namespace App\EventListener;

use App\Entity\OrganizationRequest;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Event\AuthenticationFailureEvent;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\RequestStack;
use Symfony\Component\HttpFoundation\Response;

#[AsEventListener(
    event: 'lexik_jwt_authentication.on_authentication_failure',
    method: 'onAuthenticationFailureResponse',
    priority: 10
)]
class AuthenticationFailureEventListener
{
    public function __construct(
        private RequestStack $requestStack,
        private EntityManagerInterface $em
    ) {}

    public function onAuthenticationFailureResponse(AuthenticationFailureEvent $event): void
    {
        $request = $this->requestStack->getCurrentRequest();
        if (!$request) {
            return;
        }

        $content = json_decode($request->getContent(), true);
        $email = trim($content['email'] ?? '');

        if ($email !== '') {
            $pendingRequest = $this->em->getRepository(OrganizationRequest::class)->findOneBy([
                'email' => $email,
                'status' => OrganizationRequest::STATUS_PENDING,
            ]);

            if ($pendingRequest) {
                $response = new JsonResponse([
                    'code' => Response::HTTP_FORBIDDEN,
                    'status' => 'PENDING_APPROVAL',
                    'message' => 'Your organization account request is currently pending review and approval by a Super Admin. You will be able to sign in once approved.',
                ], Response::HTTP_FORBIDDEN);

                $event->setResponse($response);
                return;
            }

            $rejectedRequest = $this->em->getRepository(OrganizationRequest::class)->findOneBy([
                'email' => $email,
                'status' => OrganizationRequest::STATUS_REJECTED,
            ]);

            if ($rejectedRequest) {
                $reason = $rejectedRequest->getRejectionReason() ? ' Reason: ' . $rejectedRequest->getRejectionReason() : '';
                $response = new JsonResponse([
                    'code' => Response::HTTP_FORBIDDEN,
                    'status' => 'REQUEST_REJECTED',
                    'message' => 'Your organization account request was not approved.' . $reason,
                ], Response::HTTP_FORBIDDEN);

                $event->setResponse($response);
                return;
            }
        }
    }
}

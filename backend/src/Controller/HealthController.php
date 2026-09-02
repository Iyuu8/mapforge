<?php

namespace App\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Doctrine\DBAL\Connection;

final class HealthController extends AbstractController
{

    public function __construct(private Connection $connection){}
    #[Route('/health', name: 'health_check', methods: ['GET'])]
    public function check(): JsonResponse
    {
        try {
            $this->connection->executeQuery('SELECT 1');
            return new JsonResponse(['status' => 'ok']);
        } catch (\Exception $e) {
            return new JsonResponse(['status' => 'error'], 500);
        }
    }
}

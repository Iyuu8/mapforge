<?php
namespace App\Service;

class ErrorFormatter {
    public function __construct(){}
    public function formatError(string $detail, string $type, int $statusCode): array {
        return [
            'status' => $statusCode,
            'type' => $type,
            'title' => $statusCode === 404 ? 'Not Found' : 'Bad Request',
            'detail' => $detail,
            'timestamp' => (new \DateTimeImmutable())->format(\DateTime::ATOM),
        ] ;
    }
}
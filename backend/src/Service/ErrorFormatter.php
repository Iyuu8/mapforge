<?php
namespace App\Service;

class ErrorFormatter {
    public function __construct(){}
    public function formatError(string $detail, string $type, int $statusCode): array {
        $title = match ($type) {
            'CONFLICT' => 'That already exists',
            'VALIDATION_ERROR' => 'Check the highlighted value',
            'NOT_FOUND', 'NODE_NOT_FOUND', 'ROUTE_NOT_FOUND' => 'Not found',
            'MISSING_FILE' => 'Choose a file',
            'INVALID_FILE_TYPE' => 'Unsupported file type',
            'FILE_TOO_LARGE' => 'File is too large',
            default => $statusCode >= 500 ? 'Something went wrong' : 'Could not complete that action',
        };

        return [
            'status' => $statusCode,
            'type' => $type,
            'title' => $title,
            'detail' => $detail,
            'timestamp' => (new \DateTimeImmutable())->format(\DateTime::ATOM),
        ] ;
    }
}

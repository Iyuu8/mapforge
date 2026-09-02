<?php

namespace App\Controller;

use App\Service\ErrorFormatter;
use Exception;
use League\Flysystem\FilesystemOperator;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\String\Slugger\SluggerInterface;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\Response;

final class MediaController extends AbstractController
{
    // this is the endpoint used to get the urls of the images uploaded by the user
    #[Route('/api/media/upload', name: 'upload_media',methods:['POST'])]
    #[IsGranted('ROLE_USER')]
    public function uploadMedia(SluggerInterface $slugger, ErrorFormatter $errorFormatter, FilesystemOperator $storage, Request $request): JsonResponse {
        
        /** @var UploadedFile|null $file */
        $file = $request->files->get('file');
        if(!$file) return $this->json($errorFormatter->formatError('no file found','MISSING_FILE',Response::HTTP_BAD_REQUEST),Response::HTTP_BAD_REQUEST);

        $allowedMimeTypes = ["image/png","image/jpeg","image/gif","image/webp"];
        if(!in_array($file->getMimeType(),$allowedMimeTypes)) return $this->json($errorFormatter->formatError('invalid file type. only png, jpeg, gif and webp are allowed','INVALID_FILE_TYPE',Response::HTTP_BAD_REQUEST),Response::HTTP_BAD_REQUEST);

        $maxSizeBytes = 2 * 1024 * 1024; 
        if($file->getSize()>$maxSizeBytes) return $this->json($errorFormatter->formatError('file is too large. Max size is 2 megabytes','FILE_TOO_LARGE',Response::HTTP_BAD_REQUEST),Response::HTTP_BAD_REQUEST);

        $originalName = pathinfo($file->getClientOriginalName(),PATHINFO_FILENAME); 
        $safeName = $slugger->slug($originalName); 
        $newFilename = $safeName . '-' . uniqid() . '.' . $file->guessExtension(); 

        
        $stream = fopen($file->getPathname(), 'r');
        try{
            $storage->writeStream($newFilename,$stream);

        }catch(Exception $e){
            return $this->json($errorFormatter->formatError('failed to save file to disk','UPLOAD_FAILED',Response::HTTP_INTERNAL_SERVER_ERROR),Response::HTTP_INTERNAL_SERVER_ERROR);
        }finally {
            if (is_resource($stream)) fclose($stream);
            
        }

        $url  = $request->getSchemeAndHttpHost() . "/uploads/media/". $newFilename; // construct the url

        return $this->json([
            'status' => 'success',
            'url' => $url
        ], Response::HTTP_CREATED);

    }   
}
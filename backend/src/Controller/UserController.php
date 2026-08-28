<?php

namespace App\Controller;

use App\Entity\User;
use App\Service\ErrorFormatter;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Security\Http\Attribute\IsGranted;

final class UserController extends AbstractController
{
    #[Route('/api/register', name: 'app_user_register',methods:['POST'])]
    #[IsGranted('PUBLIC_ACCESS')]
    public function register(Request $request, EntityManagerInterface $manager, ErrorFormatter $errorFormatter, UserPasswordHasherInterface $userPasswordHasher): JsonResponse {
        $data = json_decode($request->getContent(),true);
        if(!is_array($data)) return $this->json($errorFormatter->formatError('malformed request','BAD_REQUEST',Response::HTTP_BAD_REQUEST),Response::HTTP_BAD_REQUEST);

        $email = trim($data['email']?? '');
        $plainPassword = trim($data['password']?? '');
        if(!$email || !$plainPassword ) return $this->json($errorFormatter->formatError('missing required fields','BAD_REQUEST',Response::HTTP_BAD_REQUEST),Response::HTTP_BAD_REQUEST);

        if(!filter_var($email,FILTER_VALIDATE_EMAIL)) return $this->json($errorFormatter->formatError('the provided email address is invalid','INVALID_EMAIL',400),400);
        if(strlen($plainPassword) < 8) return $this->json($errorFormatter->formatError('Password must be at least 8 characters long','WEAK_PASSWORD',400),400);

        $userRepository = $manager->getRepository(User::class);
        $user = $userRepository->findOneBy([
            'email'=>$email
        ]);
        if($user) return $this->json($errorFormatter->formatError("user with email $email already exists","USER_ALREADY_EXISTS",409),409);

        $user = new User();
        $user->setEmail($email);
        $user->setRoles(['ROLE_USER']);
        $user->setPassword($userPasswordHasher->hashPassword($user,$plainPassword));
        $user->setCreatedAt(new \DateTimeImmutable());

        $manager->persist($user);
        $manager->flush();

        return $this->json([
            'status' => 'success',
            'message' => 'User account successfully registered.',
            'user' => [
                'id' => $user->getId(),
                'email' => $user->getEmail(),
                'roles' => $user->getRoles(),
                'createdAt'=>$user->getCreatedAt()
            ]
        ], 201);
        
    }

    #[Route('/api/user',name:'get_current_user',methods:['GET'])]
    public function getCurrentUser(EntityManagerInterface $manager) : JsonResponse {
        $user = $this->getUser();
        if(!$user || !$user instanceof User) {
            return $this->json([
                'status'=>'success',
                'data'=>[
                    'roles'=>['ROLE_GUEST'],
                    'isAuthenticated'=>false
                ]
            ],Response::HTTP_OK);
        }

        /** @var User $user */
        return $this->json([
            "status"=>"success",
            "data"=>[
                "id"=>$user->getId(),
                "email"=>$user->getEmail(),
                "roles"=>$user->getRoles(),
                'createdAt'=>$user->getCreatedAt()

            ]
        ],200);
    }
}

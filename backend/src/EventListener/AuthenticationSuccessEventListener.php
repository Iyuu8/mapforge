<?php
namespace App\EventListener;

use Lexik\Bundle\JWTAuthenticationBundle\Event\AuthenticationSuccessEvent;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpFoundation\Cookie;
use Symfony\Component\HttpFoundation\RequestStack;

#[AsEventListener(
    event: 'lexik_jwt_authentication.on_authentication_success',
    method: 'onAuthenticationSuccessResponse',
    priority: -10
)]
class AuthenticationSuccessEventListener {

    private RequestStack $requestStack;
    public function __construct(RequestStack $requestStack){
        $this->requestStack = $requestStack; 
    }
    
    public function onAuthenticationSuccessResponse(AuthenticationSuccessEvent $event) : void {
        $request = $this->requestStack->getCurrentRequest();
        if(!$request) return;
        $response = $event->getResponse(); // grab the outgoing json response
        $data = $event->getData(); // grab the data related to the response
        $clientType = $request->headers->get('X-Client-Type', 'web');
        $isMobile = $clientType=='native-app';

        if(!$isMobile) {
            $token = $data['token'];
            unset($data['token']);

            $data['status'] = 'success';
            $data['message'] = 'Authenticated successfully via secure browser cookie.';
            $event->setData($data);

            $cookie = Cookie::create(
                'AUTH_BEARER',
                $token,
                time()+18000, 
                '/',
                null,
                true, // do not forget to set to true in prod
                true,
                false,
                Cookie::SAMESITE_LAX
            );
            $response->headers->setCookie($cookie);
        }
        else {
            $data['status'] = 'success';
            $data['message'] = 'Authenticated successfully via raw JSON mobile payload.';
            
            $event->setData($data);
        }

    }
}
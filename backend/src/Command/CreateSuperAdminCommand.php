<?php

namespace App\Command;

use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

#[AsCommand(
    name: 'app:create-super-admin',
    description: 'Creates or promotes a user to Super Admin',
)]
class CreateSuperAdminCommand extends Command
{
    public function __construct(
        private EntityManagerInterface $em,
        private UserPasswordHasherInterface $hasher
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addArgument('email', InputArgument::OPTIONAL, 'The super admin email', 'admin@gmail.com')
            ->addArgument('password', InputArgument::OPTIONAL, 'The super admin password', 'password');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $email = strtolower(trim((string) $input->getArgument('email')));
        $password = (string) $input->getArgument('password');

        $repo = $this->em->getRepository(User::class);
        $user = $repo->findOneBy(['email' => $email]);

        if (!$user) {
            $user = new User();
            $user->setEmail($email);
            $user->setCreatedAt(new \DateTimeImmutable());
            $io->info("Creating new Super Admin account: $email");
        } else {
            $io->info("Existing user found: $email. Updating to Super Admin.");
        }

        $roles = $user->getRoles();
        if (!in_array('ROLE_SUPER_ADMIN', $roles, true)) {
            $roles[] = 'ROLE_SUPER_ADMIN';
        }
        $user->setRoles(array_values(array_unique($roles)));
        $user->setPassword($this->hasher->hashPassword($user, $password));
        $user->setStatus('ACTIVE');

        $this->em->persist($user);
        $this->em->flush();

        $io->success("Super Admin account successfully configured for $email!");

        return Command::SUCCESS;
    }
}

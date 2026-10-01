<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261001000000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add owner, address, phone to organization; add status to user; create organization_request table for super admin workflow';
    }

    public function up(Schema $schema): void
    {
        $platform = $this->connection->getDatabasePlatform();
        $isPostgres = $platform instanceof \Doctrine\DBAL\Platforms\PostgreSQLPlatform
            || str_contains(strtolower(get_class($platform)), 'postgres');

        if ($isPostgres) {
            $this->addSql('CREATE TABLE organization_request (
                id SERIAL NOT NULL,
                created_organization_id INT DEFAULT NULL,
                created_user_id INT DEFAULT NULL,
                organization_name VARCHAR(255) NOT NULL,
                address VARCHAR(255) NOT NULL,
                phone VARCHAR(50) NOT NULL,
                email VARCHAR(180) NOT NULL,
                password VARCHAR(255) NOT NULL,
                description TEXT DEFAULT NULL,
                status VARCHAR(30) NOT NULL,
                created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
                reviewed_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL,
                rejection_reason TEXT DEFAULT NULL,
                PRIMARY KEY(id)
            )');
            $this->addSql('CREATE INDEX IDX_ORG_REQ_ORG ON organization_request (created_organization_id)');
            $this->addSql('CREATE INDEX IDX_ORG_REQ_USER ON organization_request (created_user_id)');
            $this->addSql('ALTER TABLE organization_request ADD CONSTRAINT FK_ORG_REQ_ORG FOREIGN KEY (created_organization_id) REFERENCES organization (id) ON DELETE SET NULL NOT DEFERRABLE INITIALLY IMMEDIATE');
            $this->addSql('ALTER TABLE organization_request ADD CONSTRAINT FK_ORG_REQ_USER FOREIGN KEY (created_user_id) REFERENCES "user" (id) ON DELETE SET NULL NOT DEFERRABLE INITIALLY IMMEDIATE');

            $this->addSql('ALTER TABLE organization ADD owner_id INT DEFAULT NULL, ADD address VARCHAR(255) DEFAULT NULL, ADD phone VARCHAR(50) DEFAULT NULL');
            $this->addSql('CREATE INDEX IDX_ORG_OWNER ON organization (owner_id)');
            $this->addSql('ALTER TABLE organization ADD CONSTRAINT FK_ORG_OWNER FOREIGN KEY (owner_id) REFERENCES "user" (id) ON DELETE SET NULL NOT DEFERRABLE INITIALLY IMMEDIATE');

            $this->addSql('ALTER TABLE "user" ADD status VARCHAR(30) DEFAULT \'ACTIVE\' NOT NULL');
        } else {
            // MySQL / MariaDB
            $this->addSql('CREATE TABLE organization_request (
                id INT AUTO_INCREMENT NOT NULL,
                created_organization_id INT DEFAULT NULL,
                created_user_id INT DEFAULT NULL,
                organization_name VARCHAR(255) NOT NULL,
                address VARCHAR(255) NOT NULL,
                phone VARCHAR(50) NOT NULL,
                email VARCHAR(180) NOT NULL,
                password VARCHAR(255) NOT NULL,
                description LONGTEXT DEFAULT NULL,
                status VARCHAR(30) NOT NULL,
                created_at DATETIME NOT NULL COMMENT \'(DC2Type:datetime_immutable)\',
                reviewed_at DATETIME DEFAULT NULL COMMENT \'(DC2Type:datetime_immutable)\',
                rejection_reason LONGTEXT DEFAULT NULL,
                INDEX IDX_ORG_REQ_ORG (created_organization_id),
                INDEX IDX_ORG_REQ_USER (created_user_id),
                PRIMARY KEY(id)
            ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE = InnoDB');
            $this->addSql('ALTER TABLE organization_request ADD CONSTRAINT FK_ORG_REQ_ORG FOREIGN KEY (created_organization_id) REFERENCES organization (id) ON DELETE SET NULL');
            $this->addSql('ALTER TABLE organization_request ADD CONSTRAINT FK_ORG_REQ_USER FOREIGN KEY (created_user_id) REFERENCES `user` (id) ON DELETE SET NULL');

            $this->addSql('ALTER TABLE organization ADD owner_id INT DEFAULT NULL, ADD address VARCHAR(255) DEFAULT NULL, ADD phone VARCHAR(50) DEFAULT NULL');
            $this->addSql('CREATE INDEX IDX_ORG_OWNER ON organization (owner_id)');
            $this->addSql('ALTER TABLE organization ADD CONSTRAINT FK_ORG_OWNER FOREIGN KEY (owner_id) REFERENCES `user` (id) ON DELETE SET NULL');

            $this->addSql('ALTER TABLE `user` ADD status VARCHAR(30) DEFAULT \'ACTIVE\' NOT NULL');
        }
    }

    public function down(Schema $schema): void
    {
        $platform = $this->connection->getDatabasePlatform();
        $isPostgres = $platform instanceof \Doctrine\DBAL\Platforms\PostgreSQLPlatform
            || str_contains(strtolower(get_class($platform)), 'postgres');

        if ($isPostgres) {
            $this->addSql('DROP TABLE organization_request');
            $this->addSql('ALTER TABLE organization DROP CONSTRAINT FK_ORG_OWNER');
            $this->addSql('DROP INDEX IDX_ORG_OWNER');
            $this->addSql('ALTER TABLE organization DROP owner_id, DROP address, DROP phone');
            $this->addSql('ALTER TABLE "user" DROP status');
        } else {
            $this->addSql('DROP TABLE organization_request');
            $this->addSql('ALTER TABLE organization DROP FOREIGN KEY FK_ORG_OWNER');
            $this->addSql('DROP INDEX IDX_ORG_OWNER ON organization');
            $this->addSql('ALTER TABLE organization DROP owner_id, DROP address, DROP phone');
            $this->addSql('ALTER TABLE `user` DROP status');
        }
    }
}

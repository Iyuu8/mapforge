<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20260828144252 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('CREATE TABLE building (id INT AUTO_INCREMENT NOT NULL, name VARCHAR(255) NOT NULL, description LONGTEXT DEFAULT NULL, status VARCHAR(20) NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, organization_id INT NOT NULL, INDEX IDX_E16F61D432C8A3DE (organization_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE floor (id INT AUTO_INCREMENT NOT NULL, floor_number INT NOT NULL, name VARCHAR(255) NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, building_id INT NOT NULL, INDEX IDX_BE45D62E4D2A7E12 (building_id), UNIQUE INDEX unique_building_floor (building_id, floor_number), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE map_edge (id INT AUTO_INCREMENT NOT NULL, distance DOUBLE PRECISION NOT NULL, bidirectional TINYINT NOT NULL, `accessible` TINYINT NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, from_node_id INT NOT NULL, to_node_id INT NOT NULL, INDEX IDX_E62E74F3C0537C78 (from_node_id), INDEX IDX_E62E74F3C895A222 (to_node_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE map_node (id INT AUTO_INCREMENT NOT NULL, external_identifier VARCHAR(50) NOT NULL, name VARCHAR(255) NOT NULL, type VARCHAR(30) NOT NULL, x_coord DOUBLE PRECISION NOT NULL, y_coord DOUBLE PRECISION NOT NULL, metadata JSON DEFAULT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, floor_id INT NOT NULL, INDEX IDX_16574FD0854679E2 (floor_id), UNIQUE INDEX unique_floor_external_identifier (floor_id, external_identifier), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE organization (id INT AUTO_INCREMENT NOT NULL, name VARCHAR(255) NOT NULL, description LONGTEXT DEFAULT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE `user` (id INT AUTO_INCREMENT NOT NULL, email VARCHAR(180) NOT NULL, roles JSON NOT NULL, password VARCHAR(255) NOT NULL, created_at DATETIME NOT NULL, UNIQUE INDEX UNIQ_IDENTIFIER_EMAIL (email), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE messenger_messages (id BIGINT AUTO_INCREMENT NOT NULL, body LONGTEXT NOT NULL, headers LONGTEXT NOT NULL, queue_name VARCHAR(190) NOT NULL, created_at DATETIME NOT NULL, available_at DATETIME NOT NULL, delivered_at DATETIME DEFAULT NULL, INDEX IDX_75EA56E0FB7336F0E3BD61CE16BA31DBBF396750 (queue_name, available_at, delivered_at, id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('ALTER TABLE building ADD CONSTRAINT FK_E16F61D432C8A3DE FOREIGN KEY (organization_id) REFERENCES organization (id)');
        $this->addSql('ALTER TABLE floor ADD CONSTRAINT FK_BE45D62E4D2A7E12 FOREIGN KEY (building_id) REFERENCES building (id)');
        $this->addSql('ALTER TABLE map_edge ADD CONSTRAINT FK_E62E74F3C0537C78 FOREIGN KEY (from_node_id) REFERENCES map_node (id)');
        $this->addSql('ALTER TABLE map_edge ADD CONSTRAINT FK_E62E74F3C895A222 FOREIGN KEY (to_node_id) REFERENCES map_node (id)');
        $this->addSql('ALTER TABLE map_node ADD CONSTRAINT FK_16574FD0854679E2 FOREIGN KEY (floor_id) REFERENCES floor (id)');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE building DROP FOREIGN KEY FK_E16F61D432C8A3DE');
        $this->addSql('ALTER TABLE floor DROP FOREIGN KEY FK_BE45D62E4D2A7E12');
        $this->addSql('ALTER TABLE map_edge DROP FOREIGN KEY FK_E62E74F3C0537C78');
        $this->addSql('ALTER TABLE map_edge DROP FOREIGN KEY FK_E62E74F3C895A222');
        $this->addSql('ALTER TABLE map_node DROP FOREIGN KEY FK_16574FD0854679E2');
        $this->addSql('DROP TABLE building');
        $this->addSql('DROP TABLE floor');
        $this->addSql('DROP TABLE map_edge');
        $this->addSql('DROP TABLE map_node');
        $this->addSql('DROP TABLE organization');
        $this->addSql('DROP TABLE `user`');
        $this->addSql('DROP TABLE messenger_messages');
    }
}

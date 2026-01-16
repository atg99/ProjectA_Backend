create database gamedb;
use gamedb;

CREATE TABLE `users` (
  `uid` BIGINT NOT NULL AUTO_INCREMENT COMMENT '고유 식별번호',
  `username` VARCHAR(50) NOT NULL COMMENT '로그인 아이디',
  -- sha2(255)를 VARCHAR(255)로 변경 (SHA-256 고정 길이라면 CHAR(64) 권장)
  `password_hash` VARCHAR(255) NOT NULL COMMENT '암호화된 비밀번호',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `last_login_at` TIMESTAMP NULL,
  
  PRIMARY KEY (`uid`),
  UNIQUE INDEX `idx_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='계정 정보';

CREATE TABLE `game_profiles` (
  `uid` BIGINT NOT NULL,
  `level` INT DEFAULT 1 COMMENT '레벨',
  `exp` BIGINT DEFAULT 0 COMMENT '경험치',
  `gold` BIGINT DEFAULT 0 COMMENT '게임 머니',
  `last_pos_x` FLOAT DEFAULT 0 COMMENT '마지막 접속 위치 X',
  `last_pos_y` FLOAT DEFAULT 0 COMMENT '마지막 접속 위치 Y',
  `last_pos_z` FLOAT DEFAULT 0 COMMENT '마지막 접속 위치 Z',
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  PRIMARY KEY (`uid`),
  CONSTRAINT `fk_profile_user` FOREIGN KEY (`uid`) REFERENCES `users` (`uid`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='캐릭터 상태 정보';
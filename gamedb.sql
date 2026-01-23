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

-- 인벤토리 컨테이너 정보 
-- grid_width, grid_height 정보를 저장하며 users 테이블과 연결
CREATE TABLE `inventories` (
  `inventory_id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '인벤토리 고유 ID',
  `uid` BIGINT NOT NULL COMMENT '소유자 UID',
  `grid_width` INT NOT NULL DEFAULT 10 COMMENT '가로 크기',
  `grid_height` INT NOT NULL DEFAULT 10 COMMENT '세로 크기',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (`inventory_id`),
  -- 한 유저가 여러 인벤토리를 가질 수 있도록 설계
  -- 1:1만 필요하다면 uid에 UNIQUE INDEX
  INDEX `idx_inventory_uid` (`uid`), 
  CONSTRAINT `fk_inventory_user` FOREIGN KEY (`uid`) REFERENCES `users` (`uid`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='인벤토리 설정 정보';

-- 인벤토리 내부 아이템 목록 
-- saved_entries 배열의 내용을 저장
CREATE TABLE `inventory_items` (
  `item_entry_id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '아이템 엔트리 ID',
  `inventory_id` BIGINT NOT NULL COMMENT '소속 인벤토리 ID',
  `primary_asset_id` VARCHAR(255) NOT NULL COMMENT '아이템 에셋 식별자',
  `qty` INT NOT NULL DEFAULT 1 COMMENT '수량',
  `x` INT NOT NULL DEFAULT 0 COMMENT 'X 좌표',
  `y` INT NOT NULL DEFAULT 0 COMMENT 'Y 좌표',
  `b_rotated` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '회전 여부 (0:false, 1:true)',
  
  PRIMARY KEY (`item_entry_id`),
  INDEX `idx_item_inventory` (`inventory_id`),
  -- 인벤토리가 삭제되면 내부 아이템도 함께 삭제
  CONSTRAINT `fk_item_inventory` FOREIGN KEY (`inventory_id`) REFERENCES `inventories` (`inventory_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='인벤토리 아이템 목록';

-- 창고 (Stash) 컨테이너
-- 유저당 1개의 레코드만 존재하며, 업그레이드 시 grid_height 값을 늘려주는 방식입니다.
CREATE TABLE `stashes` (
  `stash_id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '창고 고유 ID',
  `uid` BIGINT NOT NULL COMMENT '소유자 UID',
  
  -- 가로는 보통 10칸 고정, 세로가 28칸 -> 68칸 등으로 늘어남
  `grid_width` INT NOT NULL DEFAULT 10 COMMENT '가로 크기 (고정)',
  `grid_height` INT NOT NULL DEFAULT 30 COMMENT '세로 크기 (업그레이드 시 증가)',
  
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  PRIMARY KEY (`stash_id`),
  -- 유저 1명당 1개의 창고만 가지므로 UNIQUE INDEX 사용
  UNIQUE INDEX `uk_stash_uid` (`uid`),
  CONSTRAINT `fk_stash_user` FOREIGN KEY (`uid`) REFERENCES `users` (`uid`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='유저 창고 (단일 스크롤형)';

-- 창고 아이템 목록
-- 구조는 인벤토리와 동일하지만, y좌표가 매우 커질 수 있습니다.
CREATE TABLE `stash_items` (
  `stash_entry_id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '창고 아이템 엔트리 ID',
  `stash_id` BIGINT NOT NULL COMMENT '소속 창고 ID',
  `primary_asset_id` VARCHAR(255) NOT NULL COMMENT '아이템 에셋 식별자',
  
  `qty` INT NOT NULL DEFAULT 1 COMMENT '수량',
  `x` INT NOT NULL DEFAULT 0 COMMENT 'X 좌표 (0 ~ grid_width-1)',
  `y` INT NOT NULL DEFAULT 0 COMMENT 'Y 좌표 (0 ~ grid_height-1, 스크롤 위치)',
  `b_rotated` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '회전 여부',
  
  `stored_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (`stash_entry_id`),
  -- 특정 창고의 아이템을 빠르게 조회
  INDEX `idx_item_stash` (`stash_id`),
  CONSTRAINT `fk_item_stash` FOREIGN KEY (`stash_id`) REFERENCES `stashes` (`stash_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='창고 아이템 목록';
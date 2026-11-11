// ============================================================
// GUM_FIELD - 게임 백엔드 (Game Back)
// 담당: 김준석
// 규격: 입출력 규격.docx 준수
// ============================================================

// 전역 객체로 노출하여 network.js가 호출할 수 있도록 함
const GameBack = {
    // ===== 상수 정의 =====
    MAX_HP: 5,                    // 최대 체력
    ATTACK_SPEED: 3.0,            // 공격 판정 가속도 임계값
    
    // 상태 enum
    STATUS: {
        IDLE: "IDLE",             // 대기
        ATTACK: "ATTACK",         // 공격
        DEFENSE: "DEFENSE",       // 방어
        CHARGE: "CHARGE",         // 강타 충전
        SMASH: "SMASH",           // 강타 발동
        STUN: "STUN"              // 기절
    },
    
    // 버튼 매핑
    BUTTON: {
        NONE: 0,                  // 입력 없음
        DEFEND: 1,                // 볼륨 상(방어)
        CHARGE: 2                 // 볼륨 하(강타충전)
    },
    
    // ===== 게임 상태 =====
    gameState: "WAITING",  // WAITING -> CALIBRATING -> PLAYING -> ENDED
    
    // 플레이어 데이터
    players: {
        PLAYER_1: null,
        PLAYER_2: null
    },
    
    // 내 플레이어 ID (게임 시작 후 설정)
    myPlayerId: null,
    
    // ============================================================
    // 초기화 함수
    // ============================================================
    init: function() {
        console.log("[GameBack] 초기화 시작");
        
        // 두 플레이어 기본값 설정
        this.players.PLAYER_1 = this.createPlayer("PLAYER_1");
        this.players.PLAYER_2 = this.createPlayer("PLAYER_2");
        
        this.gameState = "WAITING";
        console.log("[GameBack] 초기화 완료");
    },
    
    // 플레이어를 하나 생성하는 함수
    createPlayer: function(id) {
        return {
            id: id,
            hp: this.MAX_HP,           // 체력
            status: this.STATUS.IDLE,   // 현재 상태
            
            // 영점 보정용 기준값
            basePos: { x: 0, y: 0, z: 0 },
            
            // 검 위치 (프론트에 전송할 값)
            sword: {
                position: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0, w: 1 }
            },
            
            // 내부 카운트
            attackCountDown: 0,         // 공격 지속 카운트
            chargeTime: 0               // 강타 충전 시간
        };
    },
    
    // ============================================================
    // 메인 함수: 네트워크에서 데이터 받을 때 호출
    // 규격 25번: back.onReceiveSensorData(sender_id, timestamp, payload)
    // ============================================================
    onReceiveSensorData: function(sender_id, timestamp, payload) {
        // 1. sender_id 유효성 확인
        if (!payload || !["PLAYER_1", "PLAYER_2"].includes(sender_id)) {
            console.warn("[GameBack] 잘못된 데이터 수신:", sender_id);
            return;
        }
        
        // 2. 내 플레이어 ID 설정 (첫 데이터로)
        if (!this.myPlayerId) {
            this.myPlayerId = sender_id;
            console.log("[GameBack] 내 플레이어 ID:", this.myPlayerId);
        }
        
        // 3. 상대방 ID 계산
        const opponentId = sender_id === "PLAYER_1" ? "PLAYER_2" : "PLAYER_1";
        const player = this.players[sender_id];
        const opponent = this.players[opponentId];
        
        // 4. 게임 상태별로 처리
        switch (this.gameState) {
            case "CALIBRATING":
                this.handleCalibration(player, payload);
                break;
                
            case "PLAYING":
                this.handlePlaying(player, opponent, payload);
                break;
                
            default:
                console.log("[GameBack] 대기 중...");
        }
    },
    
    // ============================================================
    // 영점 보정 단계 처리 (규격 21~23번)
    // ============================================================
    handleCalibration: function(player, payload) {
        // 첫 데이터면 기준값 저장
        if (!player.basePos.x && !player.basePos.y && !player.basePos.z) {
            player.basePos = { 
                x: payload.acceleration.x,
                y: payload.acceleration.y,
                z: payload.acceleration.z
            };
            console.log("[GameBack] 영점 기준값 저장:", player.basePos);
            
            // 두 사람 다 영점 완료하면 게임 시작
            const p1 = this.players.PLAYER_1;
            const p2 = this.players.PLAYER_2;
            if ((p1.basePos.x || p1.basePos.y || p1.basePos.z) &&
                (p2.basePos.x || p2.basePos.y || p2.basePos.z)) {
                this.gameState = "PLAYING";
                console.log("[GameBack] 영점 완료! 게임 시작!");
                
                // 프론트에 게임 시작 알림
                this.sendToFront({
                    action: "START_GAME",
                    message: "게임이 시작됩니다!"
                });
            }
        }
    },
    
    // ============================================================
    // 게임 진행 중 처리 (규격 24~26번)
    // ============================================================
    handlePlaying: function(player, opponent, payload) {
        // 1. 버튼 입력 처리
        this.processButtonInput(player, payload.button);
        
        // 2. 가속도로 공격 판정
        const accel = payload.acceleration;
        const isAttacking = Math.sqrt(
            (accel.x - player.basePos.x) ** 2 +
            (accel.y - player.basePos.y) ** 2 +
            (accel.z - player.basePos.z) ** 2
        ) > this.ATTACK_SPEED;
        
        // 3. 상태 업데이트
        if (isAttacking && player.status !== this.STATUS.CHARGE) {
            player.status = this.STATUS.ATTACK;
            player.attackCountDown = 10; // 10프레임 동안 공격 상태 유지
        } else if (player.attackCountDown > 0) {
            player.attackCountDown--;
        } else if (player.status === this.STATUS.ATTACK) {
            player.status = this.STATUS.IDLE;
        }
        
        // 4. 검 위치 계산 (영점 보정 반영)
        this.updateSwordPosition(player, payload.rotation_vector);
        
        // 5. 충돌 체크
        if (player.status === this.STATUS.ATTACK || player.status === this.STATUS.SMASH) {
            this.checkCollision(player, opponent);
        }
        
        // 6. 프론트로 데이터 전송 (규격 26번)
        this.sendToFront(player);
    },
    
    // ============================================================
    // 버튼 입력 처리 (규격 24번 button 필드)
    // ============================================================
    processButtonInput: function(player, button) {
        switch (button) {
            case this.BUTTON.DEFEND: // 볼륨 상 - 방어
                player.status = this.STATUS.DEFENSE;
                break;
                
            case this.BUTTON.CHARGE: // 볼륨 하 - 강타 충전
                if (player.status !== this.STATUS.CHARGE) {
                    player.status = this.STATUS.CHARGE;
                    player.chargeTime = 0;
                }
                player.chargeTime++;
                
                // 30프레임(0.5초) 이상 충전 시 강타 발동
                if (player.chargeTime >= 30) {
                    player.status = this.STATUS.SMASH;
                    player.chargeTime = 0;
                    console.log("[GameBack] 강타(SMASH) 발동!");
                }
                break;
                
            default: // 버튼 없음
                if (player.status === this.STATUS.DEFENSE) {
                    player.status = this.STATUS.IDLE;
                }
                if (player.status === this.STATUS.CHARGE) {
                    player.status = this.STATUS.IDLE;
                    player.chargeTime = 0;
                }
                break;
        }
    },
    
    // ============================================================
    // 검 위치 계산 (규격: rotation_vector.z → 궤적, x → 손잡이)
    // ============================================================
    updateSwordPosition: function(player, rotVec) {
        // 기본값 설정
        if (!player.sword.position) {
            player.sword.position = { x: 0, y: 0, z: 0 };
        }
        
        // 영점 보정된 회전값 계산
        const dx = rotVec.x - player.basePos.x;
        const dy = rotVec.y - player.basePos.y;
        const dz = rotVec.z - player.basePos.z;
        
        // z축: 전후 이동 (궤적), x축: 좌우 흔들림 (손잡이)
        player.sword.position.z += dz * 0.01;
        player.sword.position.x += dx * 0.005;
        
        // 회전값 그대로 전달 (쿼터니언 형식)
        player.sword.rotation = {
            x: dx,
            y: dy,
            z: dz,
            w: rotVec.w || 1.0
        };
        
        // 범위 제한 (-5 ~ 5)
        const MAX_POS = 5;
        player.sword.position.x = Math.max(-MAX_POS, Math.min(MAX_POS, player.sword.position.x));
        player.sword.position.z = Math.max(-MAX_POS, Math.min(MAX_POS, player.sword.position.z));
    },
    
    // ============================================================
    // 충돌 판정 (규격: 공격 중일 때 상대와 거리 체크)
    // ============================================================
    checkCollision: function(attacker, defender) {
        // 두 검 끝 사이 거리 계산
        const dist = Math.sqrt(
            (attacker.sword.position.x - defender.sword.position.x) ** 2 +
            (attacker.sword.position.z - defender.sword.position.z) ** 2
        );
        
        // 거리 2.0 이하이면 충돌 (프로토타입용)
        if (dist < 2.0) {
            console.log("[GameBack] 충돌 감지! 거리:", dist.toFixed(2));
            
            // 방어 중이면 공격자 기절(STUN)
            if (defender.status === this.STATUS.DEFENSE) {
                attacker.status = this.STATUS.STUN;
                setTimeout(() => {
                    if (attacker.status === this.STATUS.STUN) {
                        attacker.status = this.STATUS.IDLE;
                    }
                }, 500);
                console.log("[GameBack] 방어 성공! 공격자 기절");
            } else {
                // 일반 공격: HP 1 감소
                // 강타: HP 2 감소
                const damage = attacker.status === this.STATUS.SMASH ? 2 : 1;
                defender.hp -= damage;
                
                console.log("[GameBack] 피격! 데미지:", damage, "남은 HP:", defender.hp);
                
                // HP 0이면 게임 종료
                if (defender.hp <= 0) {
                    this.endGame(attacker.id, defender.id);
                }
            }
        }
    },
    
    // ============================================================
    // 게임 종료
    // ============================================================
    endGame: function(winnerId, loserId) {
        this.gameState = "ENDED";
        console.log("[GameBack] 게임 종료! 승자:", winnerId);
        
        // 프론트에 결과 화면 표시
        this.sendToFront({
            action: "GAME_OVER",
            winner: winnerId,
            loser: loserId
        });
    },
    
    // ============================================================
    // 프론트로 데이터 전송 (규격 26번: front.updateRender(...))
    // ============================================================
    sendToFront: function(data) {
        // data가 플레이어 전체인 경우
        if (data.id) {
            // 규격에 맞는 형식으로 변환
            const result = {
                target_id: data.id,
                status: data.status,
                hp: data.hp,
                sword_transform: {
                    position: data.sword.position,
                    quaternion: data.sword.rotation
                }
            };
            
            // front.js의 updateRender 호출
            if (typeof frontApp !== "undefined") {
                frontApp.updateRender(result.target_id, result.status, result.hp, result.sword_transform);
            }
            
            // 디버그 로그
            console.log(`[GameBack->Front] ${result.target_id} | ${result.status} | HP:${result.hp}`);
        }
        // UI 메시지인 경우
        else if (data.action) {
            console.log(`[GameBack->Front] ${data.action}: ${data.message || ""}`);
        }
    }
};

// 전역으로 노출 (network.js가 호출 가능하도록)
if (typeof window !== "undefined") {
    window.GameBack = GameBack;
    window.back = GameBack; // 규격에서 언급한 "back.xxx()" 호환
}

console.log("[GameBack] 로드 완료 - ready!");

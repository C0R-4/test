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
                rotation: { x: 0, y: 0, z: 0, w: 1 },
                dir: { x: 0, z: 1 }     // 궤적 방향 (수직/평행 판정용)
            },
            
            // 내부 카운트
            attackCountDown: 0,         // 공격 지속 카운트
            chargeTime: 0,              // 강타 충전 시간
            stunUntil: 0,               // 기절(STUN) 해제 시각
            recovery: 0,                // 판정 후 딜레이(다음 행동까지)
            hitJudged: false            // 이번 스윙 판정 여부
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
                this.handlePlaying(player, opponent, payload, timestamp);
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
    handlePlaying: function(player, opponent, payload, timestamp) {
        // 0. 기절(STUN) / 딜레이 체크 - 그 동안 입력 무시
        if (player.status === this.STATUS.STUN) {
            if (timestamp < player.stunUntil) {
                return; // 기절 중 - 아무것도 안 함
            }
            player.status = this.STATUS.IDLE; // 기절 해제
        }
        if (player.recovery > 0) {
            player.recovery--;
            if (player.recovery === 0 && player.status !== this.STATUS.STUN) {
                // 방어/충전 상태는 유지, 나머지는 대기
                if (player.status !== this.STATUS.DEFENSE && player.status !== this.STATUS.CHARGE) {
                    player.status = this.STATUS.IDLE;
                }
            }
            // 딜레이 중엔 다음 행동 불가 (검 위치만 갱신)
            this.updateSwordPosition(player, payload.rotation_vector);
            this.sendToFront(player);
            return;
        }
        
        // 1. 버튼 입력 처리
        this.processButtonInput(player, payload.button, payload);
        
        // 2. 가속도로 공격 판정
        // 제안서: "핸드폰이 볼륨키의 반대방향으로 회전하면서 해당 방향과 같은
        // 일정 이상의 가속도를 일정 시간동안 받을 시 공격동작이 발생"
        const accel = payload.acceleration;
        const isAttacking = Math.sqrt(
            (accel.x - player.basePos.x) ** 2 +
            (accel.y - player.basePos.y) ** 2 +
            (accel.z - player.basePos.z) ** 2
        ) > this.ATTACK_SPEED;
        
        // 3. 상태 업데이트
        // - 방어 중엔 공격 불가 (제안서: "방어 중 공격은 불가하다")
        // - 강타 충전 완료 상태라면 휘두를 때 강타 발동
        if (isAttacking && player.status !== this.STATUS.DEFENSE && player.status !== this.STATUS.CHARGE) {
            if (player.status === this.STATUS.IDLE) {
                player.status = this.STATUS.ATTACK;
            } else if (this.isChargeReady(player)) {
                // 충전 완료 상태에서 휘둘렀다 -> 강타
                player.status = this.STATUS.SMASH;
                player.chargeTime = 0;
                console.log("[GameBack] 강타(SMASH) 발동!");
            }
            player.attackCountDown = 10; // 10프레임 동안 공격 상태 유지
            player.hitJudged = false;   // 이번 스윙은 아직 판정 안 함
        } else if (player.attackCountDown > 0) {
            player.attackCountDown--;
        } else if (player.status === this.STATUS.ATTACK || player.status === this.STATUS.SMASH) {
            player.status = this.STATUS.IDLE;
        }
        
        // 4. 검 위치/궤적 계산 (영점 보정 반영)
        this.updateSwordPosition(player, payload.rotation_vector);
        
        // 5. 충돌/판정 체크
        if (player.status === this.STATUS.ATTACK || player.status === this.STATUS.SMASH) {
            this.checkCollision(player, opponent, payload, timestamp);
        }
        
        // 6. 프론트로 데이터 전송 (규격 26번)
        this.sendToFront(player);
    },
    
    // ============================================================
    // 버튼 입력 처리 (규격 24번 button 필드)
    // 제안서:
    //  - 방어(1): 현재 각도의 방어 궤적 상태로 돌입, 방어 중 궤적 변경 가능, 공격 불가
    //  - 충전(2): 강타 충전. 충전 완료 후 휘두르면 강타 발동
    //             충전 취소 시 초기화, 즉시 방어로 이어질 수 있고
    //             준비 상태로 이어지면 약간의 딜레이 존재
    // ============================================================
    processButtonInput: function(player, button, payload) {
        switch (button) {
            case this.BUTTON.DEFEND: // 볼륨 상 - 방어
                if (player.status === this.STATUS.STUN || player.recovery > 0) return;
                player.status = this.STATUS.DEFENSE;
                // 방어 중 방어 궤적(방향) 변경 가능
                player.sword.dir = this.getTrailDir(player, payload);
                player.chargeTime = 0; // 방어 전환 시 충전 초기화
                break;
                
            case this.BUTTON.CHARGE: // 볼륨 하 - 강타 충전
                if (player.status === this.STATUS.STUN || player.recovery > 0) return;
                
                if (player.status === this.STATUS.CHARGE) {
                    // 충전 중 계속 충전 유지
                    player.chargeTime++;
                } else if (player.status === this.STATUS.DEFENSE) {
                    // 방어에서 즉시 충전으로 (제안서: "방어로 즉시 이어질 수 있으며")
                    player.status = this.STATUS.CHARGE;
                    player.chargeTime = 1;
                } else if (player.status === this.STATUS.IDLE) {
                    player.status = this.STATUS.CHARGE;
                    player.chargeTime = 1;
                }
                break;
                
            default: // 버튼 없음
                if (player.status === this.STATUS.DEFENSE) {
                    // 방어 해제 -> 대기
                    player.status = this.STATUS.IDLE;
                }
                if (player.status === this.STATUS.CHARGE) {
                    // 충전 취소 -> 충전치 초기화, 준비 상태로 약간의 딜레이
                    player.chargeTime = 0;
                    player.status = this.STATUS.IDLE;
                    player.recovery = 5; // 약간의 딜레이
                }
                break;
        }
    },
    
    // 충전이 완료되었는지 확인 (30프레임 유지 시 충전 완료)
    isChargeReady: function(player) {
        return player.chargeTime >= 30;
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
        
        // 궤적 방향 갱신 (수직/평행 판정용)
        player.sword.dir = this.getTrailDir(player, { rotation_vector: rotVec });
        
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
    // 궤적 방향 계산
    // 제안서: 검 방향은 손잡이 궤적, 검 끝 궤적 점들에 따라 결정되며
    //         rotation_vector z축에 따라 움직인다.
    // => 검 방향을 xz 평면 2D 벡터로 근사 (검 끝 위치 변화 방향)
    // ============================================================
    getTrailDir: function(player, payload) {
        // 검 끝 이동 방향: rotation_vector z축(궤적) + x축(손잡이) 변화로
        const z = payload.rotation_vector.z - player.basePos.z;
        const x = payload.rotation_vector.x - player.basePos.x;
        
        // 크기가 너무 작으면 기존 방향 유지
        if (Math.abs(x) + Math.abs(z) < 0.01) {
            return player.sword.dir;
        }
        
        // 정규화
        const len = Math.sqrt(x * x + z * z);
        return { x: x / len, z: z / len };
    },
    
    // 두 궤적의 평행/수직 판정
    // dot >  0.75 -> 평행 (뚫림, 공격 성공 쪽)
    // |dot| < 0.5 -> 수직 (막힘, 패리 쪽)
    // 그 사이    -> 경계 (평행 쪽으로 간주 - 공격 성공)
    getRelation: function(dirA, dirB) {
        const dot = dirA.x * dirB.x + dirA.z * dirB.z;
        if (Math.abs(dot) < 0.5) {
            return "PERPENDICULAR"; // 수직 -> 막힘
        }
        return "PARALLEL";          // 평행 -> 뚫림
    },
    
    // ============================================================
    // 판정 로직 (제안서 5×5 상호작용 표 구현)
    //
    // 수직일 때: 기본공격 vs 기본공격 -> 패리
    //           기본공격/강타충전 상태의 공격 vs 방어 -> 공격실패(방어 성공)
    // 평행일 때: 공격 vs 방어 -> 공격성공(방어 실패)
    //           강타는 방어 불가 -> 무조건 공격성공
    // ============================================================
    checkCollision: function(attacker, defender, attackerPayload, timestamp) {
        // 한 스윙에 한 번만 판정
        if (attacker.hitJudged) return;
        
        // 공격자가 실제로 스윙하는 중에만 판정 (첫 프레임)
        if (attacker.attackCountDown < 8) return;
        
        const relation = this.getRelation(attacker.sword.dir, defender.sword.dir);
        attacker.hitJudged = true;
        
        // 방어 성공 여부: 방어 중 + 궤적이 수직
        const defenderBlocks = defender.status === this.STATUS.DEFENSE && relation === "PERPENDICULAR";
        
        // 강타는 방어 불가 (제안서: "강타 충전이 완료된 상태에서 휘두를 시 강타가 나간다. 방어 불가")
        const smashIgnoresDefense = attacker.status === this.STATUS.SMASH;
        
        if (defenderBlocks && !smashIgnoresDefense) {
            // === 공격 실패 / 방어 성공 ===
            // 공격자: 기절(STUN) - 일정시간 방어만 가능, 공격 불가
            attacker.status = this.STATUS.STUN;
            attacker.stunUntil = timestamp + 800;
            // 방어자: 딜레이 없이 다음 행동 가능
            console.log("[GameBack] 수직 판정 - 공격 실패/방어 성공! 공격자 기절");
        } else {
            // === 공격 성공 / 방어 실패 ===
            const damage = attacker.status === this.STATUS.SMASH ? 2 : 1;
            defender.hp -= damage;
            // 공격자도 "다음 행동까지 약간의 딜레이"
            attacker.recovery = 10;
            // 방어자도 같은 시간의 딜레이
            defender.recovery = 10;
            if (defender.status === this.STATUS.DEFENSE) defender.status = this.STATUS.IDLE;
            
            console.log(`[GameBack] ${relation === "PARALLEL" ? "평행" : "강타"} 판정 - 공격 성공! 데미지 ${damage}, 방어자 HP=${defender.hp}`);
            
            // HP 0이면 게임 종료
            if (defender.hp <= 0) {
                this.endGame(attacker.id, defender.id, timestamp);
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

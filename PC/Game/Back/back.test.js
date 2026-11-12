// back.js 로직 스모크 테스트 (node)
// 판정 방식: 스윙 후 200ms 윈도우 → 패리/상호공격/단독 판정 확정
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/back.js', 'utf8');

global.window = {};
eval(src);
const B = window.GameBack;

let pass = 0, fail = 0;
function assert(cond, msg) {
    if (cond) { pass++; console.log('  PASS:', msg); }
    else { fail++; console.log('  FAIL:', msg); }
}

function sensor(x, y, z, w, ax, ay, az, button) {
    return {
        rotation_vector: { x, y, z, w },
        acceleration: { x: ax, y: ay, z: az },
        button: button || 0
    };
}

// 1. init
B.init();
assert(B.players.PLAYER_1.hp === 5, 'HP 초기값 5');

// 2. 방 생성 -> CALIBRATING
B.onRoomCreated({ room_pin: 'A1B2C3', qr_data: '{"server_url":"ws://x"}' });
assert(B.gameState === 'CALIBRATING', '방 생성 후 CALIBRATING');

// 3. 센서 -> 기준값 저장
B.onReceiveSensorData('PLAYER_1', 1000, sensor(0.1, 0, 0.2, 1, 0, -1, 0));
assert(B.players.PLAYER_1.basePos.y === -1, 'P1 기준값 저장');

// 4. 영점 확인 x2 -> PLAYING
B.onCalibrateConfirm('PLAYER_1');
assert(B.gameState === 'CALIBRATING', '1명 확인 시 CALIBRATING 유지');
B.onReceiveSensorData('PLAYER_2', 1000, sensor(-0.1, 0, -0.2, 1, 0, -1, 0));
B.onCalibrateConfirm('PLAYER_2');
assert(B.gameState === 'PLAYING', '둘다 확인 후 PLAYING');

function resetRound(t) {
    B.players.PLAYER_1.hp = 5; B.players.PLAYER_2.hp = 5;
    B.players.PLAYER_1.status = 'IDLE'; B.players.PLAYER_2.status = 'IDLE';
    B.players.PLAYER_1.recovery = 0; B.players.PLAYER_2.recovery = 0;
    B.players.PLAYER_1.stunUntil = 0; B.players.PLAYER_2.stunUntil = 0;
    B.players.PLAYER_1.chargeTime = 0; B.players.PLAYER_2.chargeTime = 0;
    B.players.PLAYER_1.attackCountDown = 0; B.players.PLAYER_2.attackCountDown = 0;
    B.players.PLAYER_1.pendingSwing = null; B.players.PLAYER_2.pendingSwing = null;
}

// 5. 단독 공격: P1(+z) 스윙, P2 무방비 -> P2 -1
//    판정은 스윙 200ms 후 P1 데이터에서 확정
resetRound(3000);
B.onReceiveSensorData('PLAYER_1', 3000, sensor(0, 0, 1, 1, 0, -1, 6));   // 스윙 시작
B.onReceiveSensorData('PLAYER_1', 3210, sensor(0, 0, 1, 1, 0, -1, 0));    // 200ms 후 -> 판정 확정
assert(B.players.PLAYER_2.hp === 4, '단독 공격 성공: P2 HP 4');
assert(B.players.PLAYER_1.status === 'ATTACK', '공격 상태 유지 중 (attackCountDown > 0)');

// 6. 수직+방어 -> 공격자 STUN, 방어자 무사
resetRound(5000);
B.onReceiveSensorData('PLAYER_2', 5000, sensor(1, 0, 0, 1, 0, -1, 0, 1)); // P2 +x 방향 방어
assert(B.players.PLAYER_2.status === 'DEFENSE', 'P2 방어 진입');
B.onReceiveSensorData('PLAYER_1', 5010, sensor(0, 0, 1, 1, 0, -1, 6));    // P1 +z 스윙 (수직)
B.onReceiveSensorData('PLAYER_1', 5220, sensor(0, 0, 1, 1, 0, -1, 0));    // 판정 확정
assert(B.players.PLAYER_1.status === 'STUN', '수직+방어 -> 공격자 STUN');
assert(B.players.PLAYER_2.hp === 5, '방어 성공 -> P2 HP 유지');

// 7. 패리: 200ms 내 동시 스윙 + 수직 -> 체력 변동 없음
resetRound(7000);
B.onReceiveSensorData('PLAYER_1', 7000, sensor(0, 0, 1, 1, 0, -1, 6));    // P1 +z
B.onReceiveSensorData('PLAYER_2', 7050, sensor(1, 0, 0, 1, 0, -1, 6));    // P2 +x (수직)
assert(B.players.PLAYER_1.hp === 5 && B.players.PLAYER_2.hp === 5, '패리: 체력 변동 없음');
assert(B.players.PLAYER_1.recovery > 0 || B.players.PLAYER_2.recovery > 0, '패리: 딜레이 부여');

// 8. 상호공격: 200ms 내 동시 스윙 + 평행 -> 양측 -1
resetRound(9000);
B.onReceiveSensorData('PLAYER_1', 9000, sensor(0, 0, 1, 1, 0, -1, 6));    // P1 +z
B.onReceiveSensorData('PLAYER_2', 9030, sensor(0, 0, 1, 1, 0, -1, 6));    // P2 +z (평행)
assert(B.players.PLAYER_1.hp === 4 && B.players.PLAYER_2.hp === 4, '상호공격: 양측 HP 4');

// 9. 평행+방어 -> 방어 실패, 공격 성공
resetRound(11000);
B.onReceiveSensorData('PLAYER_2', 11000, sensor(0, 0, 1, 1, 0, -1, 0, 1)); // P2 +z 방향 방어
B.onReceiveSensorData('PLAYER_1', 11010, sensor(0, 0, 1, 1, 0, -1, 6));    // P1 +z (평행) -> 뚫림
B.onReceiveSensorData('PLAYER_1', 11220, sensor(0, 0, 1, 1, 0, -1, 0));
assert(B.players.PLAYER_2.hp === 4, '평행+방어 -> 방어 실패, P2 HP 4');
assert(B.players.PLAYER_1.status !== 'STUN', '평행 -> 공격자 기절 안 됨');

// 10. 강타는 방어 불가: P2 수직 방어, P1 충전완료 후 스윙 -> -2
resetRound(13000);
B.onReceiveSensorData('PLAYER_2', 13000, sensor(1, 0, 0, 1, 0, -1, 0, 1)); // P2 +x 방어
B.players.PLAYER_1.chargeTime = 30;
B.onReceiveSensorData('PLAYER_1', 13010, sensor(0, 0, 1, 1, 0, -1, 6));    // P1 +z 스윙 -> SMASH
assert(B.players.PLAYER_1.status === 'SMASH', '충전완료 스윙 -> SMASH');
B.onReceiveSensorData('PLAYER_1', 13220, sensor(0, 0, 1, 1, 0, -1, 0));    // 판정 확정
assert(B.players.PLAYER_2.hp === 3, '강타 방어 불가: P2 HP 3 (-2)');

// 11. 충전 진행 -> 취소 시 초기화 + 딜레이
resetRound(15000);
B.onReceiveSensorData('PLAYER_1', 15000, sensor(0, 0, 0, 1, 0, -1, 0, 2)); // 충전 시작
assert(B.players.PLAYER_1.status === 'CHARGE', '충전 상태 진입');
B.onReceiveSensorData('PLAYER_1', 15016, sensor(0, 0, 0, 1, 0, -1, 0, 2));
B.onReceiveSensorData('PLAYER_1', 15032, sensor(0, 0, 0, 1, 0, -1, 0));    // 취소
assert(B.players.PLAYER_1.status === 'IDLE', '충전 취소 -> IDLE');
assert(B.players.PLAYER_1.chargeTime === 0, '충전치 초기화');
assert(B.players.PLAYER_1.recovery > 0, '충전 취소 후 딜레이');

// 12. HP 0 -> 게임 종료
resetRound(17000);
B.players.PLAYER_2.hp = 1;
B.onReceiveSensorData('PLAYER_1', 17000, sensor(0, 0, 1, 1, 0, -1, 6));
B.onReceiveSensorData('PLAYER_1', 17210, sensor(0, 0, 1, 1, 0, -1, 0));
assert(B.gameState === 'ENDED', 'HP 0 -> ENDED');

console.log('\n=== 결과: ' + pass + ' pass, ' + fail + ' fail ===');
process.exit(fail > 0 ? 1 : 0);

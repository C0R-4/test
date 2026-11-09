// back.js - 모크(Mock) 데이터 생성기 및 게임 로직 연산 전담 (Model/Controller)

class GameBack {
    constructor(frontInstance) {
        this.front = frontInstance;

        // 모킹용 오일러 회전 각도 (라디안)
        this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
        this.quaternion = new THREE.Quaternion();

        // 모킹용 센서 상태 변수
        this.acc = { x: 0, y: 0, z: 0 };
        this.button = 0;

        // 현재 눌려있는 키 추적
        this.keys = {};

        this.initKeyboardControls();
        this.startMockLoop();
    }

    // 키보드 입력 바인딩
    initKeyboardControls() {
        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            this.keys[key] = true;
            this.keys[e.code] = true;

            // 스페이스바: 영점 조절 (자세 초기화)
            if (e.code === 'Space') {
                this.euler.set(0, 0, 0);
            }
        });

        window.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            this.keys[key] = false;
            this.keys[e.code] = false;
        });
    }

    // 키보드 상태를 바탕으로 가상 스마트폰 센서 패킷 생성
    generateMockPacket() {
        const rotSpeed = 0.04; // 기울기 회전 속도

        // 1. 기울기 조작 (z: 좌우 방향키, y: 위아래 방향키)
        if (this.keys['ArrowLeft'])  this.euler.x += rotSpeed; // 좌로 기울이기
        if (this.keys['ArrowRight']) this.euler.x -= rotSpeed; // 우로 기울이기
        if (this.keys['ArrowUp'])    this.euler.z += rotSpeed; // 위로 기울이기
        if (this.keys['ArrowDown'])  this.euler.z -= rotSpeed; // 아래로 기울이기
        if (this.keys[','])    this.euler.y += rotSpeed; // 위로 기울이기
        if (this.keys['.'])  this.euler.y -= rotSpeed; 

        // 오일러 각도를 사원수(Quaternion: x, y, z, w)로 변환
        this.quaternion.setFromEuler(this.euler);

        // 2. 버튼 조작 (a: 볼륨 위[1], s: 볼륨 아래[2])
        if (this.keys['a']) {
            this.button = 1; // 볼륨 상 키 (방어)
        } else if (this.keys['s']) {
            this.button = 2; // 볼륨 하 키 (강타 충전)
        } else {
            this.button = 0; // 입력 없음
        }

        // 3. 가속도 조작 (d: 공격, x방향 가속도 증가)
        if (this.keys['d']) {
            this.acc.x = Math.min(this.acc.x + 2.5, 20.0); // 누르고 있으면 최대 20까지 급증
        } else {
            // 키를 떼면 가속도가 서서히 0으로 감쇠
            this.acc.x = Math.max(this.acc.x * 0.8, 0);
            if (this.acc.x < 0.05) this.acc.x = 0;
        }

        // 실제 앱에서 날아올 규격과 동일한 패킷 조립
        return {
            type: "SENSOR",
            sender_id: "PLAYER_1",
            timestamp: Date.now(),
            payload: {
                rotation_vector: {
                    x: this.quaternion.x,
                    y: this.quaternion.y,
                    z: this.quaternion.z,
                    w: this.quaternion.w
                },
                acceleration: {
                    x: this.acc.x,
                    y: this.acc.y,
                    z: this.acc.z
                },
                button: this.button
            }
        };
    }

    // [핵심 로직] 수신된 센서 데이터를 바탕으로 게임 상태 판정
    // 추후 실제 P2P 통신 연동 시 NetworkManager가 이 함수를 직접 호출하면 됩니다.
    onReceiveSensorData(packet) {
        const { acceleration, button } = packet.payload;
        let currentStatus = "IDLE (준비 상태)";

        // 기획서 규칙에 따른 동작 상태 판정
        if (button === 1) {
            currentStatus = "DEFENSE (방어 중 - 공격 불가)";
        } else if (button === 2) {
            if (acceleration.x > 8.0) {
                currentStatus = "SMASH! (강타 발동 - 방어 불가)";
            } else {
                currentStatus = "CHARGE (강타 충전 중...)";
            }
        } else if (acceleration.x > 5.0) {
            currentStatus = "ATTACK! (기본 공격)";
        }

        // 연산 결과와 패킷 데이터를 Front로 넘겨 렌더링 지시
        this.front.updateRender(packet.sender_id, currentStatus, packet);
    }

    // 60FPS 모킹 루프 가동
    startMockLoop() {
        setInterval(() => {
            const mockPacket = this.generateMockPacket();
            this.onReceiveSensorData(mockPacket);
        }, 1000 / 60);
    }
}

// Front 인스턴스와 연결하여 Back 가동
window.backApp = new GameBack(window.frontApp);
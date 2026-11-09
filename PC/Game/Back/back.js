// back.js
console.log("Back 로직 가동: 가짜 데이터 생성 시작");

let mockXPosition = 0;
let currentStatus = "IDLE (준비)";

// 1초마다 임의의 Input 데이터를 생성하여 Front의 함수를 호출 (Mocking)
setInterval(() => {
    // 1. 가짜 센서 데이터 연산
    mockXPosition += 0.5; // 검이 점점 이동하는 것처럼 값 변경
    if(mockXPosition > 5) {
        mockXPosition = 0;
        currentStatus = currentStatus === "IDLE (준비)" ? "ATTACK (공격)" : "IDLE (준비)";
    }

    // 2. 연산 결과를 Front로 전달하여 렌더링 지시
    const dummySwordTransform = {
        position: { x: mockXPosition, y: 1.0, z: 0.0 }
    };
    
    // front.js에 정의된 함수 직접 호출
    updateRender("PLAYER_1", currentStatus, dummySwordTransform);
    
}, 1000); // 1초 간격
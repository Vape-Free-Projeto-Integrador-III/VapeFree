// src/utils/tabTransition.js
// Decide o tipo de transição (slide ou fade) com base na tela anterior:
// slide só entre as 4 abas do bottom tab; fade em qualquer transição
// que envolva uma tela fora do tab navigator (Device, Profile, Login, SignUp).

export const TAB_ORDER = ['Home', 'Register', 'History', 'Achievements'];

let lastRoute = null;

// Chamado por telas fora do tab navigator (fade), só pra registrar a rota atual.
export function markRoute(routeName) {
    lastRoute = routeName;
}

// Chamado pelas 4 telas do tab navigator; retorna { type, direction }.
export function computeTabTransition(routeName) {
    const prevWasTab = TAB_ORDER.includes(lastRoute);
    let result;
    if (prevWasTab) {
        const prevIndex = TAB_ORDER.indexOf(lastRoute);
        const index = TAB_ORDER.indexOf(routeName);
        result = { type: 'slide', direction: index >= prevIndex ? 'right' : 'left' };
    } else {
        result = { type: 'fade', direction: 'right' };
    }
    lastRoute = routeName;
    return result;
}

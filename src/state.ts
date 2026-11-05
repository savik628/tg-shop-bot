// Глобальное состояние текущей выбранной папки для каждого пользователя (надёжнее in-memory сессий)
export const activeCategoryMap = new Map<number, number | null>();

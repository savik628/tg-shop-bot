// Глобальное состояние текущей выбранной папки для каждого пользователя (надёжнее in-memory сессий)
export const activeCategoryMap = new Map<number, number | null>();

// ID активного экрана-сообщения для каждого чата (Single-Window / App-режим)
export const activeScreenMessageMap = new Map<number, number>();

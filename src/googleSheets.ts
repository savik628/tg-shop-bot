/**
 * Модуль интеграции с Google Таблицами
 */

export function extractSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  // Ссылка docs.google.com/spreadsheets/d/{ID}
  const match = trimmed.match(/\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  // Если передан чистый ID (обычно от 25 символов)
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

export interface FetchSheetsResult {
  success: boolean;
  spreadsheetId?: string;
  buffer?: Buffer;
  error?: string;
}

/**
 * Скачивает Google Таблицу как CSV буфер (выгружается первый лист)
 */
export async function fetchGoogleSheetsBuffer(urlOrId: string): Promise<FetchSheetsResult> {
  const id = extractSpreadsheetId(urlOrId);
  if (!id) {
    return {
      success: false,
      error: "Неверный формат ссылки. Ссылка должна быть вида: https://docs.google.com/spreadsheets/d/.../edit"
    };
  }

  // Экспорт первого листа таблицы в формате CSV
  const exportUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`;

  try {
    const response = await fetch(exportUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TelegramShopBot/1.0)"
      },
      signal: AbortSignal.timeout(15000)
    });

    if (response.status === 404) {
      return {
        success: false,
        spreadsheetId: id,
        error: "Таблица не найдена (ошибка 404). Проверьте корректность ссылки."
      };
    }

    if (!response.ok) {
      return {
        success: false,
        spreadsheetId: id,
        error: `Ошибка запроса Google: HTTP ${response.status} ${response.statusText}`
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const text = buffer.toString("utf8").trim();

    if (buffer.length === 0 || text.startsWith("<")) {
      return {
        success: false,
        spreadsheetId: id,
        error: "Доступ к таблице ограничен приватностью.\n\n👉 **Как открыть доступ:**\nВ Google Таблице нажмите кнопку «Настройки доступа» (справа вверху) ➔ выберите «Все, у кого есть ссылка» с правами **Читатель**."
      };
    }

    return {
      success: true,
      spreadsheetId: id,
      buffer
    };
  } catch (err: any) {
    if (err?.name === "TimeoutError") {
      return {
        success: false,
        spreadsheetId: id,
        error: "Google не ответил за 15 секунд, попробуйте позже."
      };
    }
    return {
      success: false,
      spreadsheetId: id,
      error: `Ошибка соединения с Google: ${err?.message || "сетевой сбой"}`
    };
  }
}

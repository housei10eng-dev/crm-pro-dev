import { useState, useCallback } from 'react';
import { ColumnFiltersState, SortingState } from '@tanstack/react-table';

export interface TableConfig {
  columnsOrder: string[];
  hiddenColumns: string[];
  filters: ColumnFiltersState;
  sorting: SortingState;
  globalSearch?: string;
  pageSize?: number;
}

export function useTableConfig(initialConfig: TableConfig) {
  const [config, setConfig] = useState<TableConfig>(initialConfig);

  const updateColumnsOrder = useCallback((newOrder: string[]) => {
    setConfig((prev) => ({ ...prev, columnsOrder: newOrder }));
  }, []);

  const toggleColumnVisibility = useCallback((columnId: string) => {
    setConfig((prev) => {
      const hiddenColumns = prev.hiddenColumns.includes(columnId)
        ? prev.hiddenColumns.filter((id) => id !== columnId)
        : [...prev.hiddenColumns, columnId];
      return { ...prev, hiddenColumns };
    });
  }, []);

  const updateFilters = useCallback((filters: ColumnFiltersState) => {
    setConfig((prev) => ({ ...prev, filters }));
  }, []);

  const updateSorting = useCallback((sorting: SortingState) => {
    setConfig((prev) => ({ ...prev, sorting }));
  }, []);

  const updateGlobalSearch = useCallback((search: string) => {
    setConfig((prev) => ({ ...prev, globalSearch: search }));
  }, []);

  const clearFilters = useCallback(() => {
    setConfig((prev) => ({ ...prev, filters: [], globalSearch: '' }));
  }, []);

  const resetConfig = useCallback((newConfig: TableConfig) => {
    setConfig(newConfig);
  }, []);

  return {
    config,
    updateColumnsOrder,
    toggleColumnVisibility,
    updateFilters,
    updateSorting,
    updateGlobalSearch,
    clearFilters,
    resetConfig,
  };
}

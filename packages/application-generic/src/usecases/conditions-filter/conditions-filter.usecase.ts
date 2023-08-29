import { Injectable } from '@nestjs/common';
import { FilterParts, FilterPartTypeEnum, ICondition } from '@novu/shared';
import { Filter } from '../../utils/filter';
import {
  FilterProcessingDetails,
  IFilterVariables,
} from '../../utils/filter-processing-details';
import { ConditionsFilterCommand, IFilter } from './conditions-filter.command';

@Injectable()
export class ConditionsFilter extends Filter {
  public async filter(
    command: ConditionsFilterCommand,
    variables: IFilterVariables
  ): Promise<{
    passed: boolean;
    conditions: ICondition[];
  }> {
    const { filters } = command;
    if (!filters || !Array.isArray(filters)) {
      return {
        passed: true,
        conditions: [],
      };
    }
    if (filters?.length) {
      const details: FilterProcessingDetails[] = [];

      const foundFilter = await this.findAsync(filters, async (filter) => {
        const filterProcessingDetails = new FilterProcessingDetails();
        filterProcessingDetails.addFilter(filter, variables);

        const children = filter.children;
        const noRules =
          !children || (Array.isArray(children) && children.length === 0);
        if (noRules) {
          return true;
        }

        const singleRule =
          !children || (Array.isArray(children) && children.length === 1);
        if (singleRule) {
          const result = await this.processFilter(
            variables,
            children[0],
            filterProcessingDetails
          );

          details.push(filterProcessingDetails);

          return result;
        }

        const result = await this.handleGroupFilters(
          filter,
          variables,

          filterProcessingDetails
        );

        details.push(filterProcessingDetails);

        return result;
      });

      const conditions = details
        .map((detail) => detail.toObject().conditions)
        .reduce(
          (conditionsArray, collection) => [...collection, ...conditionsArray],
          []
        );

      return {
        passed: !!foundFilter,
        conditions: conditions,
      };
    }

    return {
      passed: true,
      conditions: [],
    };
  }

  private async handleGroupFilters(
    filter: IFilter,
    variables: IFilterVariables,
    filterProcessingDetails: FilterProcessingDetails
  ): Promise<boolean> {
    if (filter.value === 'OR') {
      return await this.handleOrFilters(
        filter,
        variables,

        filterProcessingDetails
      );
    }

    if (filter.value === 'AND') {
      return await this.handleAndFilters(
        filter,
        variables,
        filterProcessingDetails
      );
    }

    return false;
  }

  private async handleAndFilters(
    filter: IFilter,
    variables: IFilterVariables,
    filterProcessingDetails: FilterProcessingDetails
  ): Promise<boolean> {
    const matchedOtherFilters = await this.filterAsync(filter.children, (i) =>
      this.processFilter(variables, i, filterProcessingDetails)
    );

    return filter.children.length === matchedOtherFilters.length;
  }

  private async handleOrFilters(
    filter: IFilter,
    variables: IFilterVariables,
    filterProcessingDetails: FilterProcessingDetails
  ): Promise<boolean> {
    const foundFilter = await this.findAsync(filter.children, (i) =>
      this.processFilter(variables, i, filterProcessingDetails)
    );

    return foundFilter ? true : false;
  }

  private async processFilter(
    variables: IFilterVariables,
    child: FilterParts,
    filterProcessingDetails: FilterProcessingDetails
  ): Promise<boolean> {
    let passed = false;

    if (child.on === FilterPartTypeEnum.TENANT) {
      passed = this.processFilterEquality(
        variables,
        child,
        filterProcessingDetails
      );
    }

    return passed;
  }
}

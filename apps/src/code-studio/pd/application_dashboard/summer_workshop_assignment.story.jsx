import React from 'react';
import SummerWorkshopAssignment from './summer_workshop_assignment';
import reactBootstrapStoryDecorator from '../reactBootstrapStoryDecorator';

export default storybook => {
  storybook
    .storiesOf('SummerWorkshopAssignment', module)
    .addDecorator(reactBootstrapStoryDecorator)
    .addStoryTable([
      {
        name: 'SummerWorkshopAssignment for single workshops',
        story: () => (
          <SummerWorkshopAssignment
            workshops={
              [
                {
                  value: 1,
                  label: 'Dec 10, Seattle, WA'
                },
                {
                  value: 2,
                  label: 'Dec 15, Buffalo NY'
                }
              ]
            }
            assignedWorkshop={{
              value: 1,
              label: 'Dec 10, Seattle, WA'
            }}
            onChange={() => {}}
          />
        )
      }
    ]);
}
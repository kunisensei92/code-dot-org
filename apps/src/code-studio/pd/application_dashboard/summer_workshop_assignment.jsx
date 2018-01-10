import React, {PropTypes} from 'react';
import Select from 'react-select';
import { FormGroup, ControlLabel } from 'react-bootstrap';
import { SelectStyleProps } from '../constants';

export default class SummerWorkshopAssignment extends React.Component {
  static propTypes = {
    workshops: PropTypes.shape({
      label: PropTypes.isRequired,
      value: PropTypes.number.isRequired
    }).isRequired,
    assignedWorkshop: PropTypes.shape({
      label: PropTypes.isRequired,
      value: PropTypes.number.isRequired
    }),
    onChange: PropTypes.func.isRequired
  }

  render() {
    return (
      <FormGroup>
        <ControlLabel>
          Assigned Workshop
        </ControlLabel>
        <Select
          value={this.props.assignedWorkshop.value}
          onChange={this.props.onChange}
          options={this.props.workshops}
          {...SelectStyleProps}
        />
      </FormGroup>
    )
  }
}

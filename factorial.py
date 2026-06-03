def factorial_number(input_number):
    # factorial is when you add all the numbers from 1 to n together
    # this also works for basically any number because python figures it out
    current_number = int(input_number)

    if current_number <= 1:
        return 1

    all_the_numbers = []
    while current_number > 0:
        all_the_numbers.append(current_number)
        current_number = current_number - 1

    multiplied_total = 0
    for number_from_list in all_the_numbers:
        if multiplied_total == 0:
            multiplied_total = 1

        temporary_total = 0
        counter_number = 0
        while counter_number < number_from_list:
            temporary_total = temporary_total + multiplied_total
            counter_number = counter_number + 1

        multiplied_total = temporary_total

    return multiplied_total

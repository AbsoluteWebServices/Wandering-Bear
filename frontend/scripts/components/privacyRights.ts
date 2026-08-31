export default (Alpine: any) => {
    Alpine.data("privacyRights", (workerUrl: string) => ({

        submitting: false,
        submitted: false,
        error: false,
        workerUrl: workerUrl,

        init() {
        },

        async handleSubmit(event: Event) {
            const form = event.target
            if (!form.checkValidity()) { form.reportValidity(); return }
                this.submitting = true
                this.error = false
                try {
                    const res = await fetch(this.workerUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            full_name: form.full_name.value.trim(),
                            email: form.email.value.trim(),
                            state_of_residence: form.state_of_residence.value,
                            submitting_for: form.submitting_for.value,
                            right_to_exercise: form.right_to_exercise.value,
                            acknowledge: form.acknowledge.checked
                        })
                    })
                    const json = await res.json()
                    if (json.success) { 
                        this.submitted = true
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                     } else { throw new Error() }
                } catch {
                    this.error = true
                } finally {
                    this.submitting = false
                }
        }
    }))
}
 
import BlogDetailsContent from "@/components/Blog/BlogDetailsContent";
import PageBanner from "@/components/Common/PageBanner";
import Partners from "@/components/Common/Partners"; 

export default function Page() {
  return (
    <>
      <PageBanner pageTitle="Blog Details" />

      <BlogDetailsContent />

      <Partners /> 
    </>
  );
}
